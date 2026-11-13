// Isolated real cover/player UI with a local YouTube API stand-in. No accounts.
import React from "react";
import { createRoot } from "react-dom/client";
import { WatchlistCover } from "../../src/components/WatchlistCover.jsx";
import { TrailerPreviewGroup } from "../../src/components/TrailerPreview.jsx";
const instances = [];
window.YT = {Player: class {
  constructor(frame, {events}) {
    this.events = events;
    // Keep the real iframe element and its dimensions, without remote playback.
    frame.removeAttribute("src");
    frame.srcdoc = '<body style="margin:0;background:#111;color:white;display:grid;place-items:center;height:100vh;font:16px system-ui">Video viewport</body>';
    instances.push(this);
    queueMicrotask(() => events.onReady({target:this}));
  }
  mute() {}
  playVideo() { this.events.onStateChange({target:this,data:1}); }
  pauseVideo() { this.events.onStateChange({target:this,data:2}); }
  destroy() { instances.splice(instances.indexOf(this),1); }
}};
window.fetch = async () => Response.json({videoId:"abcdefghijk",trailers:[{videoId:"abcdefghijk",title:"Preview"}]});
const states = {
  Playing: () => instances.forEach(p=>p.playVideo()),
  Paused: () => instances.forEach(p=>p.pauseVideo()),
  Buffering: () => instances.forEach(p=>p.events.onStateChange({target:p,data:3})),
  "Autoplay blocked": () => instances.forEach(p=>p.events.onAutoplayBlocked()),
};
const list = new URLSearchParams(location.search).has("list");
createRoot(document.getElementById("root")).render(<main className="watchlist-page">
  <h1>Watchlist preview layout test</h1>
  <div>{Object.entries(states).map(([name,run])=><button key={name} onClick={run}>{name}</button>)}</div>
  <TrailerPreviewGroup><div className={`watchlist-grid ${list ? "watchlist-list" : ""}`}>
    {[1,2,3].map(id=><article className="saved-card" key={id}>
      <WatchlistCover priority anime={{id:990100+id,title:`Preview sample ${id}`,previewVideoId:"abcdefghijk",previewRegionChecked:true}} />
      <div className="saved-content"><h3>Preview sample {id}</h3><p>TV · 12 episodes</p><button>More details</button></div>
    </article>)}
  </div></TrailerPreviewGroup>
</main>);
