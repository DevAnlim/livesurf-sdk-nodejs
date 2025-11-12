/**
 * LiveSurf API Node.js SDK
 * ========================
 * Клиент для работы с API https://api.livesurf.ru/
 *
 * Возможности:
 *  - Авторизация по API ключу (заголовок Authorization)
 *  - Поддержка всех HTTP методов (GET, POST, PATCH, DELETE)
 *  - Контроль лимита скорости (10 запросов в секунду)
 *  - Повтор запросов при ошибках 429/5xx с экспоненциальной задержкой
 *  - Подробные ошибки и удобный формат ответов
 *
 *
 * Автор: DecPro
 * Версия: 1.0.0
 */

import fetch from "node-fetch";

export class LiveSurfApi {
  #apiKey;
  #baseUrl = "https://api.livesurf.ru/";
  #timeout = 15000;
  #rateLimit = 10;
  #maxRetries = 3;
  #initialBackoffMs = 500;
  #requestTimestamps = [];

  /**
   * Конструктор клиента
   * @param {string} apiKey — ваш API ключ LiveSurf
   * @param {object} [options] — дополнительные параметры
   * @param {string} [options.baseUrl] — адрес API (по умолчанию https://api.livesurf.ru/)
   * @param {number} [options.timeout] — таймаут запроса в миллисекундах
   * @param {number} [options.rateLimit] — лимит запросов в секунду
   * @param {number} [options.maxRetries] — число повторов при ошибках
   * @param {number} [options.initialBackoffMs] — начальная задержка перед повтором (мс)
   */
  constructor(apiKey, options = {}) {
    this.#apiKey = apiKey;
    if (options.baseUrl) this.#baseUrl = options.baseUrl.replace(/\/+$/, "") + "/";
    if (options.timeout) this.#timeout = options.timeout;
    if (options.rateLimit) this.#rateLimit = options.rateLimit;
    if (options.maxRetries) this.#maxRetries = options.maxRetries;
    if (options.initialBackoffMs) this.#initialBackoffMs = options.initialBackoffMs;
  }

  /** Контроль лимита запросов (не более N в секунду) */
  async #applyRateLimit() {
    const now = Date.now() / 1000;
    this.#requestTimestamps = this.#requestTimestamps.filter(t => t > now - 1);

    if (this.#requestTimestamps.length >= this.#rateLimit) {
      const earliest = Math.min(...this.#requestTimestamps);
      const sleep = 1 - (now - earliest);
      if (sleep > 0) await this.#sleep(sleep * 1000);
    }

    this.#requestTimestamps.push(Date.now() / 1000);
  }

  /** Основной метод запроса с повторами */
  async #request(method, endpoint, data = null) {
    const url = this.#baseUrl + endpoint.replace(/^\/+/, "");
    let attempt = 0;

    while (true) {
      attempt++;
      await this.#applyRateLimit();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.#timeout);

        const res = await fetch(url, {
          method: method.toUpperCase(),
          headers: {
            "Accept": "application/json",
            "Authorization": this.#apiKey,
            "Content-Type": "application/json"
          },
          body: data ? JSON.stringify(data) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeout);

        const text = await res.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          json = text;
        }

        if (res.ok) return json;

        // Повтор при 429 и 5xx
        if ((res.status === 429 || (res.status >= 500 && res.status < 600)) && attempt <= this.#maxRetries) {
          await this.#sleepForRetry(attempt);
          continue;
        }

        const msg = json?.error || text;
        throw new Error(`Ошибка API (${res.status}): ${msg}`);
      } catch (err) {
        // Ошибка сети или таймаут
        if (attempt <= this.#maxRetries) {
          await this.#sleepForRetry(attempt);
          continue;
        }
        throw new Error(`Ошибка соединения: ${err.message}`);
      }
    }
  }

  /** Сон (ms) */
  async #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Экспоненциальная задержка с джиттером */
  async #sleepForRetry(attempt) {
    const base = this.#initialBackoffMs * (2 ** (attempt - 1));
    const jitter = Math.floor(base * 0.2);
    const delay = base + Math.floor(Math.random() * (2 * jitter) - jitter);
    await this.#sleep(delay);
  }

  // -------------------- Универсальные методы --------------------
  get(endpoint) { return this.#request("GET", endpoint); }
  post(endpoint, data = {}) { return this.#request("POST", endpoint, data); }
  patch(endpoint, data = {}) { return this.#request("PATCH", endpoint, data); }
  delete(endpoint) { return this.#request("DELETE", endpoint); }

  // -------------------- Методы API --------------------

  // --- Общие ---
  getCategories() { return this.get("categories/"); }
  getCountries() { return this.get("countries/"); }
  getLanguages() { return this.get("languages/"); }

  // --- Источники ---
  getSourcesAd() { return this.get("sources/ad/"); }
  getSourcesMessengers() { return this.get("sources/messengers/"); }
  getSourcesSearch() { return this.get("sources/search/"); }
  getSourcesSocial() { return this.get("sources/social/"); }

  // --- Пользователь ---
  getUser() { return this.get("user/"); }
  setAutoMode() { return this.post("user/automode/"); }
  setManualMode() { return this.post("user/manualmode/"); }

  // --- Группы ---
  getGroups() { return this.get("group/all/"); }
  getGroup(id) { return this.get(`group/${id}/`); }
  createGroup(data) { return this.post("group/create/", data); }
  updateGroup(id, data) { return this.patch(`group/${id}/`, data); }
  deleteGroup(id) { return this.delete(`group/${id}/`); }
  cloneGroup(id, data = {}) { return this.post(`group/${id}/clone/`, data); }
  addGroupCredits(id, credits) { return this.post(`group/${id}/add_credits/`, { credits }); }

  // --- Страницы ---
  getPage(id) { return this.get(`page/${id}/`); }
  createPage(data) { return this.post("page/create/", data); }
  updatePage(id, data) { return this.patch(`page/${id}/`, data); }
  deletePage(id) { return this.delete(`page/${id}/`); }
  clonePage(id) { return this.post(`page/${id}/clone/`); }
  movePageUp(id) { return this.post(`page/${id}/up/`); }
  movePageDown(id) { return this.post(`page/${id}/down/`); }
  startPage(id) { return this.post(`page/${id}/start/`); }
  stopPage(id) { return this.post(`page/${id}/stop/`); }

  // --- Статистика ---
  getStats(params) {
    const query = new URLSearchParams(params).toString();
    return this.get(`pages-compiled-stats/?${query}`);
  }
}

