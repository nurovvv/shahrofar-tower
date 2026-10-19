// Russian wording shared by the panels, the floor plan and the apartment data: prices, numbers
// with a decimal comma, plural forms and room names (the floor plans name rooms in English).

export const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** 150.35 -> "150,35" */
export const num = (x) => x.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/** the form that goes with n: plural(5, 'квартира', 'квартиры', 'квартир') -> 'квартир' */
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const roomsText = (n) => `${n}-комн.`;

const ROOMS = {
  'Living room': 'Гостиная',
  'Family room': 'Семейная комната',
  Kitchen: 'Кухня',
  Bedroom: 'Спальня',
  Room: 'Комната',
  Bathroom: 'Ванная',
  WC: 'Санузел',
  Hall: 'Холл',
  Storage: 'Кладовая',
  Loggia: 'Лоджия',
  Balcony: 'Балкон',
};
export const roomName = (name) => ROOMS[name] ?? name;
