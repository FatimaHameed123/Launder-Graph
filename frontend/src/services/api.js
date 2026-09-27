import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Health check endpoint
 */
export const checkHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

/**
 * Fetch all flagged transactions
 */
export const getTransactions = async () => {
  const response = await api.get('/transactions');
  return response.data;
};

/**
 * Fetch single transaction by transaction_id
 */
export const getTransaction = async (id) => {
  const response = await api.get(`/transactions/${id}`);
  return response.data;
};

/**
 * Fetch summary statistics
 */
export const getSummary = async () => {
  const response = await api.get('/summary');
  return response.data;
};

/**
 * Fetch all investigations.
 * If backend returns 404 (not yet implemented in backend), falls back to localStorage.
 */
export const getInvestigations = async () => {
  try {
    const response = await api.get('/investigations');
    return response.data;
  } catch (err) {
    if (err.response && (err.response.status === 404 || err.response.status === 501)) {
      const stored = localStorage.getItem('laundergraph_investigations');
      return stored ? JSON.parse(stored) : [];
    }
    throw err;
  }
};

/**
 * Fetch single investigation by id
 */
export const getInvestigation = async (id) => {
  try {
    const response = await api.get(`/investigations/${id}`);
    return response.data;
  } catch (err) {
    if (err.response && (err.response.status === 404 || err.response.status === 501)) {
      const stored = localStorage.getItem('laundergraph_investigations');
      const list = stored ? JSON.parse(stored) : [];
      const found = list.find((i) => String(i.id) === String(id) || String(i.transaction_id) === String(id));
      if (found) return found;
    }
    throw err;
  }
};

/**
 * Create new investigation
 * body: { transaction_id, status, notes }
 */
export const createInvestigation = async (data) => {
  try {
    const response = await api.post('/investigations', data);
    return response.data;
  } catch (err) {
    if (err.response && (err.response.status === 404 || err.response.status === 405 || err.response.status === 501)) {
      const stored = localStorage.getItem('laundergraph_investigations');
      const list = stored ? JSON.parse(stored) : [];
      const newRecord = {
        id: list.length > 0 ? Math.max(...list.map((i) => Number(i.id) || 0)) + 1 : 1,
        transaction_id: Number(data.transaction_id),
        status: data.status || 'OPEN',
        notes: data.notes || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      list.push(newRecord);
      localStorage.setItem('laundergraph_investigations', JSON.stringify(list));
      return newRecord;
    }
    throw err;
  }
};

/**
 * Update existing investigation
 * body: { status, notes }
 */
export const updateInvestigation = async (id, data) => {
  try {
    const response = await api.put(`/investigations/${id}`, data);
    return response.data;
  } catch (err) {
    if (err.response && (err.response.status === 404 || err.response.status === 405 || err.response.status === 501)) {
      const stored = localStorage.getItem('laundergraph_investigations');
      let list = stored ? JSON.parse(stored) : [];
      const index = list.findIndex((i) => String(i.id) === String(id) || String(i.transaction_id) === String(data.transaction_id));
      if (index !== -1) {
        list[index] = {
          ...list[index],
          status: data.status || list[index].status,
          notes: data.notes !== undefined ? data.notes : list[index].notes,
          updated_at: new Date().toISOString(),
        };
        localStorage.setItem('laundergraph_investigations', JSON.stringify(list));
        return list[index];
      }
      const newRecord = {
        id: Number(id) || Date.now(),
        transaction_id: Number(data.transaction_id || id),
        status: data.status || 'OPEN',
        notes: data.notes || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      list.push(newRecord);
      localStorage.setItem('laundergraph_investigations', JSON.stringify(list));
      return newRecord;
    }
    throw err;
  }
};

/**
 * Helper to safely parse reasons field (handles array, JSON string, or single-quoted string)
 */
export const parseReasons = (reasons) => {
  if (!reasons) return [];
  if (Array.isArray(reasons)) return reasons;
  if (typeof reasons === 'string') {
    try {
      const parsed = JSON.parse(reasons);
      if (Array.isArray(parsed)) return parsed;
      return [parsed];
    } catch {
      try {
        const cleaned = reasons.replace(/'/g, '"');
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
      } catch {
        return [reasons];
      }
    }
  }
  return [String(reasons)];
};

export default api;
