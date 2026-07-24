window.addEventListener('load', async () => {
  const blocks = [...document.querySelectorAll('pre code.language-mermaid')];
  if (!blocks.length) return;
  try {
    const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.esm.min.mjs');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
    for (const [i, code] of blocks.entries()) {
      const pre = code.parentElement;
      const host = document.createElement('div');
      host.className = 'mermaid';
      host.textContent = code.textContent;
      pre.replaceWith(host);
    }
    await mermaid.run({ querySelector: '.mermaid' });
  } catch (err) {
    console.warn('Mermaid rendering unavailable; preserving source blocks.', err);
  }
});
