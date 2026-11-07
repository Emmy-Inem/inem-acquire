const categories = {
  technology: /software|technology|computer|telecom|electronics|internet|technical|it service/,
  logistics: /logistics|transport|shipping|cargo|courier|freight|moving|delivery/,
  professional: /professional|consult|account|legal|lawyer|advertis|marketing|architect|employment|translation/,
  property: /estate|construction|property|architect|contractor|building/,
  healthcare: /health_care|health and medicine|hospital$|medical|dental|dentist|pharmacy|clinic|optician/,
  hospitality: /lodging|food_and_drink|dining and drinking|hotel|restaurant|cafe|guest_house|catering/,
  retail: /shopping|retail|store|supermarket|boutique/,
  finance: /financ|bank|insurance|invest|credit|mortgage/,
};

export function catalogIndustries(category, group) {
  const tags = [category, group].filter(Boolean).join(" ").toLowerCase();
  return Object.entries(categories)
    .filter(([, pattern]) => pattern.test(tags))
    .map(([industry]) => industry);
}
