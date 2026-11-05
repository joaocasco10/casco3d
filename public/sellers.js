export const SELLERS = Object.freeze(['João', 'Ingrid', 'Raissa']);

export function sellerInsights(orders) {
  return [...SELLERS, ''].map((seller) => {
    const assigned = orders.filter((order) => (order.seller || '') === seller);
    const active = assigned.filter((order) => order.status !== 'Cancelado');
    const revenue = active.reduce((total, order) => total + (+order.price || 0), 0);
    const costs = active.reduce(
      (total, order) =>
        total +
        ['filament', 'energy', 'packaging', 'shipping'].reduce(
          (sum, key) => sum + (+order[key] || 0),
          0,
        ),
      0,
    );
    return {
      seller,
      total: assigned.length,
      active: active.length,
      delivered: active.filter((order) => order.status === 'Entregue').length,
      open: active.filter((order) => order.status !== 'Entregue').length,
      canceled: assigned.length - active.length,
      revenue,
      costs,
      profit: revenue - costs,
      average: active.length ? revenue / active.length : 0,
    };
  });
}
