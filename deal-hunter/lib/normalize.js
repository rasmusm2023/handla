// Turns whatever the bot sends into the strict shape the dashboard renders.
// Deliberately forgiving: prices as "89,90 kr", missing ids, sections as separate arrays, JSON wrapped in prose.

const SECTION_ALIASES = {
  list: 'list', shopping: 'list', shoppinglist: 'list',
  mention: 'mention', mentions: 'mention', honorable: 'mention', honorablementions: 'mention',
  drink: 'drink', drinks: 'drink',
  bonus: 'bonus', bonusdeals: 'bonus',
};
const CATEGORIES = ['meat', 'poultry', 'fish', 'dairy', 'produce', 'pantry', 'frozen', 'bread', 'coffee', 'drinks', 'snacks', 'household', 'other'];

export function extractJson(text) {
  if (typeof text !== 'string') return text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw badRequest('Could not find valid JSON in the submitted text.');
  }
}

export function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : null;
}

const str = (value, max = 200) => (value == null ? '' : String(value).trim().slice(0, max));
const date = (value) => (/^\d{4}-\d{2}-\d{2}/.test(str(value)) ? str(value).slice(0, 10) : '');
const round = (n) => Math.round(n * 100) / 100;

export function slug(text) {
  return str(text)
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function collectDeals(input) {
  const out = [];
  const push = (items, section) => {
    if (Array.isArray(items)) for (const item of items) if (item && typeof item === 'object') out.push({ section, ...item });
  };
  push(input.deals, 'list');
  push(input.shoppingList, 'list');
  push(input.honorableMentions, 'mention');
  push(input.drinks, 'drink');
  push(input.bonusDeals, 'bonus');
  return out;
}

export function normalizeReport(raw, now = new Date()) {
  const input = extractJson(raw);
  if (!input || typeof input !== 'object') throw badRequest('Report must be a JSON object.');
  const warnings = [];
  const usedIds = new Set();

  const deals = [];
  for (const d of collectDeals(input)) {
    const name = str(d.name || d.item, 120);
    const price = num(d.price ?? d.dealPrice);
    if (!name || price == null) {
      warnings.push(`Skipped a deal without name or price: ${JSON.stringify(d).slice(0, 80)}`);
      continue;
    }
    const store = str(d.store, 40) || 'Unknown store';
    const location = str(d.location, 40);
    let id = slug(d.id) || slug(`${store}-${location}-${name}`);
    while (usedIds.has(id)) id += '-2';
    usedIds.add(id);

    const regularPrice = num(d.regularPrice);
    const hasSaving = regularPrice != null && regularPrice > price;
    const category = CATEGORIES.includes(str(d.category).toLowerCase()) ? str(d.category).toLowerCase() : 'other';

    deals.push({
      id,
      section: SECTION_ALIASES[str(d.section).toLowerCase().replace(/[^a-z]/g, '')] || 'list',
      name,
      brand: str(d.brand, 60),
      store,
      location,
      category,
      emoji: str(d.emoji, 8),
      price,
      regularPrice,
      savingKr: hasSaving ? round(regularPrice - price) : null,
      savingPct: hasSaving ? Math.round((1 - price / regularPrice) * 100) : null,
      unit: str(d.unit, 12) || 'st',
      packSize: str(d.packSize, 40),
      qty: Math.max(num(d.qty ?? d.quantity) || 1, 0.5),
      comparePrice: num(d.comparePrice),
      compareUnit: str(d.compareUnit, 12) || 'kr/kg',
      pricePerLitre: num(d.pricePerLitre),
      validFrom: date(d.validFrom),
      validTo: date(d.validTo),
      membersOnly: Boolean(d.membersOnly),
      memberProgram: str(d.memberProgram, 30),
      multiBuy: str(d.multiBuy, 40),
      staple: Boolean(d.staple),
      stockUp: Boolean(d.stockUp),
      note: str(d.note, 240),
      sourceUrl: /^https?:\/\//.test(str(d.sourceUrl, 500)) ? str(d.sourceUrl, 500) : '',
    });
  }
  if (!deals.length) throw badRequest('Report contains no usable deals (each needs at least "name" and "price").');

  const findDeal = (ref) => {
    const key = slug(ref);
    if (!key) return null;
    return (
      deals.find((d) => d.id === key) ||
      deals.find((d) => slug(d.name) === key) ||
      deals.find((d) => slug(d.name).includes(key) || key.includes(slug(d.name)))
    );
  };

  const dishes = (Array.isArray(input.dishes) ? input.dishes : [])
    .filter((dish) => dish && str(dish.name))
    .slice(0, 8)
    .map((dish) => ({
      name: str(dish.name, 100),
      emoji: str(dish.emoji, 8),
      uses: (Array.isArray(dish.uses) ? dish.uses : []).slice(0, 12).map((ref) => {
        const match = findDeal(ref);
        return match ? { id: match.id, label: match.name } : { id: null, label: str(ref, 80) };
      }),
      fromHome: (Array.isArray(dish.fromHome) ? dish.fromHome : []).slice(0, 12).map((x) => str(x, 60)),
      why: str(dish.why, 300),
    }));

  const starts = deals.map((d) => d.validFrom).filter(Boolean).sort();
  const week = /^\d{4}-W\d{2}$/.test(str(input.week)) ? str(input.week) : isoWeek(starts[0] ? new Date(starts[0] + 'T12:00:00') : now);

  return {
    report: {
      week,
      generatedAt: str(input.generatedAt, 40) || now.toISOString(),
      receivedAt: now.toISOString(),
      missingStores: (Array.isArray(input.missingStores) ? input.missingStores : []).slice(0, 10).map((x) => str(x, 80)),
      deals,
      dishes,
    },
    warnings,
  };
}
