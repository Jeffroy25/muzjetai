/* MuzjetAI Shared AI Writer
 * Uses the site's secure /api/gemini Netlify function.
 * No API key is exposed in the browser.
 */
(function () {
  'use strict';

  const DEFAULTS = {
    type: 'YouTube Script',
    tone: 'Professional and engaging',
    length: 'Medium',
    language: 'English',
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function buildPrompt(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    return `Create high-quality ${o.type}.

Topic / instructions:
${o.topic || ''}

Requirements:
- Language: ${o.language}
- Tone: ${o.tone}
- Length: ${o.length}
- Make the opening strong and attention-grabbing.
- Keep the writing natural and useful.
- Do not invent specific facts when the request requires factual accuracy.
- Return only the finished content unless the requested format needs headings or sections.`;
  }

  async function generate(opts, signal) {
    const prompt = buildPrompt(opts);
    const maxTokens = Math.max(512, Math.min(Number(opts?.maxTokens) || 8192, 32768));
    const r = await fetch('/api/ai-writer', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({
        model: opts?.model || undefined,
        system: opts?.system || 'You are MuzjetAI AI Writer. Write clear, original, publication-ready content. Follow the requested format exactly.',
        user: prompt,
        maxTokens
      }),
      signal
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `AI Writer error (${r.status})`);
    return j.text || '';
  }

  function open(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    let root = document.getElementById('muzjet-ai-writer');
    if (!root) {
      root = document.createElement('div');
      root.id = 'muzjet-ai-writer';
      root.innerHTML = `
        <div class="mw-backdrop"></div>
        <div class="mw-modal" role="dialog" aria-modal="true" aria-label="AI Writer">
          <div class="mw-head"><div><strong>✍️ AI Writer</strong><div class="mw-sub">Generate content with MuzjetAI</div></div><button class="mw-close" type="button" aria-label="Close">×</button></div>
          <div class="mw-grid">
            <label>Content type<select id="mw-type">
              <option>YouTube Script</option><option>Blog Article</option><option>News Article</option>
              <option>SEO Article</option><option>Video Description</option><option>Social Media Post</option>
              <option>Product Description</option><option>Rewrite / Improve</option><option>Summarize</option>
            </select></label>
            <label>Tone<select id="mw-tone">
              <option>Professional and engaging</option><option>Friendly and casual</option>
              <option>Dramatic and urgent</option><option>Simple and clear</option>
              <option>Inspirational</option><option>News / factual</option>
            </select></label>
            <label>Length<select id="mw-length">
              <option>Short</option><option selected>Medium</option><option>Long</option>
              <option>Very long</option>
            </select></label>
            <label>Language<select id="mw-language">
              <option>English</option><option>Spanish</option><option>French</option><option>Hindi</option>
              <option>Portuguese</option><option>Chinese</option>
            </select></label>
          </div>
          <label class="mw-topic">Topic / instructions<textarea id="mw-topic" rows="6" placeholder="What should AI Writer create?"></textarea></label>
          <div class="mw-actions"><button class="mw-generate" type="button">✨ Generate</button><button class="mw-copy" type="button" disabled>Copy</button><button class="mw-use" type="button" disabled>Use this</button></div>
          <div class="mw-status"></div>
          <textarea id="mw-output" rows="13" placeholder="Your generated content will appear here..."></textarea>
        </div>`;
      document.body.appendChild(root);

      const style = document.createElement('style');
      style.textContent = `
        #muzjet-ai-writer{position:fixed;inset:0;z-index:99999;display:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
        #muzjet-ai-writer.mw-open{display:block}.mw-backdrop{position:absolute;inset:0;background:rgba(10,18,35,.58);backdrop-filter:blur(3px)}
        .mw-modal{position:relative;width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;margin:12px auto;background:#fff;border-radius:18px;box-shadow:0 25px 80px rgba(0,0,0,.28);padding:20px}
        .mw-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px}.mw-head strong{font-size:22px}.mw-sub{color:#718096;font-size:13px;margin-top:2px}
        .mw-close{border:0;background:#f1f4f8;border-radius:10px;font-size:25px;width:38px;height:38px;cursor:pointer}
        .mw-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.mw-grid label,.mw-topic{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:#445}
        .mw-grid select,.mw-topic textarea,#mw-output{border:1px solid #d9e0ea;border-radius:10px;padding:10px;font:inherit;color:#172033;background:#fff}
        .mw-topic{margin-top:12px}.mw-topic textarea,#mw-output{font-size:14px;font-weight:400;resize:vertical}
        .mw-actions{display:flex;gap:8px;margin:12px 0;flex-wrap:wrap}.mw-actions button{border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer}
        .mw-generate{background:#3568e8;color:#fff}.mw-copy,.mw-use{background:#edf2ff;color:#244fe3}.mw-actions button:disabled{opacity:.5;cursor:not-allowed}
        .mw-status{min-height:20px;color:#667085;font-size:13px;margin:4px 0 8px}.mw-status.error{color:#c53030}
        #mw-output{width:100%;min-height:240px;display:block;box-sizing:border-box}
        @media(max-width:600px){.mw-grid{grid-template-columns:1fr}.mw-modal{padding:14px}}
      `;
      document.head.appendChild(style);

      const close = () => { root.classList.remove('mw-open'); };
      root.querySelector('.mw-close').onclick = close;
      root.querySelector('.mw-backdrop').onclick = close;
      root.querySelector('.mw-generate').onclick = async () => {
        const btn = root.querySelector('.mw-generate'), status = root.querySelector('.mw-status');
        const output = root.querySelector('#mw-output');
        btn.disabled = true; status.className='mw-status'; status.textContent='Writing…';
        root.querySelector('.mw-copy').disabled = true; root.querySelector('.mw-use').disabled = true;
        try {
          const text = await generate({
            type: root.querySelector('#mw-type').value,
            tone: root.querySelector('#mw-tone').value,
            length: root.querySelector('#mw-length').value,
            language: root.querySelector('#mw-language').value,
            topic: root.querySelector('#mw-topic').value,
            maxTokens: 12000
          });
          output.value = text;
          status.textContent = 'Ready.';
          root.querySelector('.mw-copy').disabled = !text;
          root.querySelector('.mw-use').disabled = !text;
        } catch (e) {
          status.className='mw-status error'; status.textContent=e.message || 'Generation failed.';
        } finally { btn.disabled=false; }
      };
      root.querySelector('.mw-copy').onclick = async () => {
        await navigator.clipboard.writeText(root.querySelector('#mw-output').value);
        root.querySelector('.mw-status').textContent='Copied.';
      };
      root.querySelector('.mw-use').onclick = () => {
        const value = root.querySelector('#mw-output').value;
        if (typeof o.onUse === 'function') o.onUse(value);
        close();
      };
      root.querySelector('#mw-type').value = o.type;
      root.querySelector('#mw-tone').value = o.tone;
      root.querySelector('#mw-length').value = o.length;
      root.querySelector('#mw-language').value = o.language;
      root.querySelector('#mw-topic').value = o.topic || '';
      root.querySelector('#mw-output').value = '';
      root.querySelector('.mw-status').textContent = '';
    } else {
      root.querySelector('#mw-type').value = o.type;
      root.querySelector('#mw-tone').value = o.tone;
      root.querySelector('#mw-length').value = o.length;
      root.querySelector('#mw-language').value = o.language;
      root.querySelector('#mw-topic').value = o.topic || '';
      root.querySelector('#mw-output').value = '';
      root.querySelector('.mw-status').textContent = '';
      root.querySelector('.mw-use').onclick = () => {
        const value = root.querySelector('#mw-output').value;
        if (typeof o.onUse === 'function') o.onUse(value);
        root.classList.remove('mw-open');
      };
    }
    root.classList.add('mw-open');
    setTimeout(() => root.querySelector('#mw-topic')?.focus(), 50);
  };

  window.MuzjetAIWriter = { open, generate };
})();