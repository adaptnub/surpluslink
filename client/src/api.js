// Thin wrapper around fetch. On a refusal it throws an Error carrying
// `reasons`, the list of every rule or input problem the server reported.

async function request(method, path, body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error ?? `Request failed (${response.status})`);
    error.reasons = data.reasons ?? [];
    throw error;
  }
  return data;
}

export const api = {
  state: () => request('GET', '/state'),
  setClock: (now) => request('POST', '/clock', { now }),

  postDonation: (donation) => request('POST', '/donations', donation),
  cancelDonation: (donationId, donorId) => request('POST', `/donations/${donationId}/cancel`, { donor_id: donorId }),

  checkClaim: (claim) => request('POST', '/claims/check', claim),
  createClaim: (claim) => request('POST', '/claims', claim),
  collectClaim: (claimId, volunteerId) => request('POST', `/claims/${claimId}/collect`, { volunteer_id: volunteerId }),
  cancelClaim: (claimId, volunteerId) => request('POST', `/claims/${claimId}/cancel`, { volunteer_id: volunteerId }),
};
