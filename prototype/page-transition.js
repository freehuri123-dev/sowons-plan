(function () {
  const TRANSITION_MS = 150;

  function isInternalPageLink(link) {
    if (!link || link.target || link.hasAttribute("download")) return false;
    const url = new URL(link.href, window.location.href);
    return (
      url.origin === window.location.origin &&
      /\.(html)?$/.test(url.pathname) &&
      url.href !== window.location.href
    );
  }

  function navigateTo(url, options = {}) {
    if (!url) return;

    const method = options.replace ? "replace" : "assign";
    document.body.classList.add("page-leaving");
    window.setTimeout(() => {
      window.location[method](url);
    }, TRANSITION_MS);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("page-ready");
  });

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest("a[href]");
    if (!isInternalPageLink(link)) return;

    event.preventDefault();
    navigateTo(link.href);
  });

  window.familyNavigate = navigateTo;
})();
