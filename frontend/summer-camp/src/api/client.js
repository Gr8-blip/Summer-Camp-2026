const BASE_URL = import.meta.env.VITE_API_URL;

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = localStorage.getItem("access_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || data.message || "Request failed");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const registerFamily = (payload) =>
  request("/users/register/", { method: "POST", body: payload });

export const initPayment = (familyId) =>
  request(`/users/initiate-payment/${familyId}/`, { method: "POST" });

export const verifyPayment = (reference) =>
  request(`/users/verify-payment/${reference}/`, { method: "GET" });

export const loginParent = (email, password) =>
  request("/users/parent-login/", { method: "POST", body: { email, password } });

export const loginStudent = (login_code) =>
  request("/users/student-login/", { method: "POST", body: { login_code } });

export const getFamilyMe = () =>
  request("/users/family/me/", { method: "GET", auth: true });
