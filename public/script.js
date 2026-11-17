// Endpoint dan format disesuaikan dengan index.js (Express + OpenRouter streaming)
const API_URL = '/api/chat';

const messagesEl = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// Riwayat percakapan yang dikirim ke server
const history = [];

const fail = (msg) => Object.assign(new Error(msg), { friendly: true });

function scrollToBottom(smooth = true) {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function addMessage(text, role) {
  const wrap = document.createElement('div');
  wrap.className = `msg msg--${role}`;
  const p = document.createElement('p');
  p.textContent = text;
  wrap.appendChild(p);
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'msg msg--bot msg--typing';
  el.setAttribute('aria-label', 'Sedang mengetik');
  el.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function setBusy(busy) { sendBtn.disabled = busy; input.disabled = busy; }

// Membaca stream SSE dari server: setiap baris "data: ..." berisi potongan teks
async function readStream(res, onText) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line) => {
    line = line.trim();
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return;

    let chunk;
    try { chunk = JSON.parse(data); } catch { return; }

    if (typeof chunk === 'string') onText(chunk);
    else if (chunk && chunk.error) throw fail('Koneksi terputus saat menerima balasan. Coba lagi.');
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(handleLine);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  history.push({ role: 'user', content: text });
  input.value = '';
  setBusy(true);
  const typing = showTyping();

  let bubble = null;
  let reply = '';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });

    if (!res.ok) {
      console.error(await res.text());
      throw fail(
        res.status === 429
          ? 'Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.'
          : `Server tidak dapat memproses pesan (kode ${res.status}).`
      );
    }

    await readStream(res, (piece) => {
      if (!bubble) { typing.remove(); bubble = addMessage('', 'bot'); }
      reply += piece;
      bubble.querySelector('p').textContent = reply;
      scrollToBottom(false);
    });

    typing.remove();
    if (reply) {
      history.push({ role: 'assistant', content: reply });
    } else {
      history.pop();
      addMessage('Balasan kosong dari server. Coba kirim ulang pesan Anda.', 'bot');
    }
  } catch (err) {
    typing.remove();
    addMessage(
      err.friendly ? err.message : 'Pesan tidak terkirim. Periksa koneksi Anda, lalu coba lagi.',
      'bot'
    );
    if (reply) history.push({ role: 'assistant', content: reply });
    else history.pop();
    console.error(err);
  } finally {
    setBusy(false);
    input.focus();
  }
});