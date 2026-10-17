/*
 * Runs before first paint so the page never flashes the wrong theme.
 * Keep in sync with applyTheme() in ./theme.ts (key "sms.theme").
 */
const script = `(function () {
  var d = document.documentElement;
  var pref = "system";
  try { pref = localStorage.getItem("sms.theme") || "system"; } catch (e) {}
  var dark = pref === "dark" || (pref !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  d.classList.toggle("dark", dark);
})();`;

export function ThemeScript() {
  // Static, developer-authored string: no user input reaches this script.
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
