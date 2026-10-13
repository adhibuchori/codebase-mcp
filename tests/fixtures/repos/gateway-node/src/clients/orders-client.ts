import axios from 'axios';

const ORDERS_URL = process.env.ORDERS_URL ?? 'http://orders:8081';

export async function getOrder(id: string) {
  const response = await axios.get(`${ORDERS_URL}/api/orders/${id}`);
  return response.data;
}

export async function cancelOrder(id: string) {
  const response = await axios.post(`${ORDERS_URL}/api/orders/${id}/cancel`, {}, { timeout: 5000 });
  if (response.status === 504) {
    throw new Error('Upstream timeout for orders service');
  }
  return response.data;
}
