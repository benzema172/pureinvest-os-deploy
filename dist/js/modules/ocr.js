document.addEventListener("DOMContentLoaded", function(){
  const video = document.querySelector(".pure-login-video");
  if(!video) return;
  const root = document.getElementById("loginScreen");
  const markLoaded = () => root && root.classList.add("video-ready");
  const markFallback = () => root && root.classList.add("video-fallback");
  video.addEventListener("canplay", markLoaded, {once:true});
  video.addEventListener("error", markFallback, {once:true});
  const playPromise = video.play();
  if(playPromise && typeof playPromise.catch === "function"){
    playPromise.catch(markFallback);
  }
  setTimeout(function(){
    if(video.readyState < 2) markFallback();
  }, 2500);
});
