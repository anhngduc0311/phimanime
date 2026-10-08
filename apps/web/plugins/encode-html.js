import { Buffer } from 'node:buffer';

// Encoding makes the delivered HTML harder to read; it does not hide the DOM
// or provide cryptographic secrecy because the browser must decode the payload.
export function encodeHtmlBody() {
  return {
    name: 'encode-html-body',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/(<body\b[^>]*>)([\s\S]*?)(<\/body>)/i, (_, open, body, close) => {
          // Vite moves the compiled module to the head before this hook runs.
          // insertAdjacentHTML does not execute embedded scripts.
          if (/<script\b/i.test(body)) {
            throw new Error('Move body scripts to the head before encoding the HTML.');
          }
          const payload = Buffer.from(body, 'utf8').toString('base64');
          const decoder = `(()=>{const s=document.currentScript;const b=Uint8Array.from(atob("${payload}"),c=>c.charCodeAt(0));s.insertAdjacentHTML("beforebegin",new TextDecoder().decode(b));s.remove()})()`;
          return `${open}\n<script>${decoder}</script>\n<noscript>Vui lòng bật JavaScript để sử dụng AniDoki.</noscript>\n${close}`;
        });
      }
    }
  };
}
