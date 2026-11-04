import {bookVideos} from './book-video-data.js';
const dialog=document.querySelector('#book-video-dialog'),video=document.querySelector('#book-video-player');
const title=document.querySelector('#book-video-title'),message=document.querySelector('#book-video-message'),fallback=document.querySelector('#book-video-fallback');
let opener,sequence=0;
function localAsset(path,extension){
  const url=new URL(path,location.origin);
  if(url.origin!==location.origin||!url.pathname.startsWith('/assets/videos/sieu-nhan/')||!url.pathname.endsWith(extension))throw new Error('Video chưa sẵn sàng.');
  return url.href;
}
function openVideo(id,button){
  const config=bookVideos[id];if(!config)return;
  const version=++sequence;video.pause();opener=button;
  title.textContent=config.title;message.textContent='';fallback.hidden=true;
  video.poster=localAsset(config.poster,'.jpg');
  video.src=localAsset(config.src,'.mp4');video.setAttribute('aria-label',config.title);
  if(!dialog.open)dialog.showModal();
  document.body.classList.add('book-video-open');video.load();
  video.play().catch(error=>{
    if(version!==sequence)return;
    if(error.name==='NotAllowedError')message.textContent='Bấm nút phát trong video để bắt đầu.';
    else if(error.name!=='AbortError')showError();
  });
}
function showError(){
  message.textContent='Chưa phát được video. Bạn có thể mở video ở tab mới hoặc thử lại sau.';
  if(video.getAttribute('src')){fallback.href=video.src;fallback.hidden=false;}
}
function decorateCards(){
  for(const card of document.querySelectorAll('.book-card[data-product-id]')){
    const id=card.dataset.productId;if(!bookVideos[id]||card.querySelector('[data-book-video]'))continue;
    const button=document.createElement('button');button.type='button';button.className='book-video-action';button.dataset.bookVideo=id;button.textContent='Xem giới thiệu';button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-label','Xem video giới thiệu '+card.querySelector('h3').textContent);
    card.querySelector('.book-card-actions').append(button);
  }
  for(const label of document.querySelectorAll('[data-book-video-duration]')){
    const config=bookVideos[label.dataset.bookVideoDuration];if(config)label.textContent=config.duration_seconds+' giây';
  }
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-book-video]');
  if(button)openVideo(button.dataset.bookVideo,button);
});
document.querySelector('#book-video-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
});
dialog.addEventListener('close',()=>{
  sequence++;video.pause();video.removeAttribute('src');video.removeAttribute('poster');video.load();
  message.textContent='';fallback.hidden=true;fallback.removeAttribute('href');document.body.classList.remove('book-video-open');
  if(opener?.isConnected)opener.focus({preventScroll:true});
});
video.addEventListener('error',()=>{if(dialog.open&&video.getAttribute('src'))showError();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();});
window.addEventListener('books:rendered',decorateCards);
decorateCards();
