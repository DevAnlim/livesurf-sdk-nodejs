import { LiveSurfApi } from "../LiveSurfApi.js";

const api = new LiveSurfApi("YOUR_API_KEY");

(async () => {
  try {
    console.log("Профиль пользователя:");
    console.log(await api.getUser());

    console.log("\nГруппы:");
    console.log(await api.getGroups());
  } catch (e) {
    console.error("Ошибка:", e.message);
  }
})();