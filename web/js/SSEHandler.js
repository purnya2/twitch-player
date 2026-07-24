// SSEHandler.js
export class SSEHandler {
  constructor(url, onMessage) {
    this.eventSource = new EventSource(url);
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };
    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      // Auto-reconnect
      setTimeout(() => this.reconnect(), 5000);
    };
  }

  reconnect() {
    this.eventSource.close();
    this.eventSource = new EventSource(this.eventSource.url);
  }

  close() {
    this.eventSource.close();
  }
}
