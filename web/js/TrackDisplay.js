export class TrackDisplay{
  constructor(ctx, canvas) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.font = "48px '0xProto Nerd Font', serif";
    this.scrollOffset = 0;
    this.isScrolling = false;
  }

  render(trackData, albumScale,likes) {
    if (!trackData) return;
    const x = this.canvas.width * 0.05 + albumScale[0] + 10;
    const y = this.canvas.height - 100;

    this.renderTrackName(trackData.track_name,x,y);
    this.renderArtist(trackData.artist_name, x, y + 40);
    this.renderTime(trackData);
    this.renderLikes(likes);


  }

  renderTrackName(name, x, y) {
    this.ctx.font = this.font;
    this.ctx.lineWidth = 5;
    this.ctx.strokeStyle = "#000000";
    this.ctx.fillStyle = "#FFFFFF";

    if (name.length > 13) {
      this.renderScrollingText(name, x, y);
    } else {
      this.ctx.strokeText(name, x, y);
      this.ctx.fillText(name, x, y);
    }
  }

  renderScrollingText(name, x, y) {
     const text = `${name} `.repeat(3);
     this.scrollOffset -= 1;

     const textWidth = this.ctx.measureText(`${name} `).width;
     if (this.scrollOffset <= -textWidth) this.scrollOffset = 0;

     this.ctx.strokeText(text, x + this.scrollOffset, y);
     this.ctx.fillText(text, x + this.scrollOffset, y);

     this.addFadeGradient(x);
  }

  addFadeGradient(x) {
    this.ctx.save();
    const gradient = this.ctx.createLinearGradient(x, 0, this.canvas.width, 0);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    gradient.addColorStop(0.01, "rgba(255, 255, 255, 0.0)");
    gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.0)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 1.0)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 1.0)");
    this.ctx.globalCompositeOperation = "destination-out";
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  renderArtist(name, x, y) {
    this.ctx.font = "25px '0xProto Nerd Font', serif";
    this.ctx.lineWidth = 3;
    this.ctx.strokeText(name, x, y);
    this.ctx.fillText(name, x, y);
  }

  renderTime(trackData) {
    const timeText = this.formatTime(trackData.time_elapsed_millis, trackData.track_length_millis);
    const x = this.canvas.width * 0.95;
    const y = this.canvas.height - 60;

    this.ctx.font = "15px '0xProto Nerd Font', serif";
    this.ctx.textAlign = "right";
    this.ctx.strokeText(timeText, x, y);
    this.ctx.fillText(timeText, x, y);
    this.ctx.textAlign = "left";
  }

  formatTime(elapsed, total) {
    const format = (ms) => {
      const seconds = Math.floor(ms / 1000);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };
    return `${format(elapsed)}/${format(total)}`;
  }

  renderLikes(likes) {
    this.ctx.textAlign = "center";
    this.ctx.font = "20px '0xProto Nerd Font', serif";
    this.ctx.lineWidth = 3;
    this.ctx.fillStyle = "#000000";
    this.ctx.fillText(likes, this.canvas.width * 0.925, this.canvas.height - 105);
    this.ctx.textAlign = "left";
  }



}
