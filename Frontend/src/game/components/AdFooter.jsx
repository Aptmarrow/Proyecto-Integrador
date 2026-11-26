import { memo } from 'react';

function AdFooter() {
  return (
    <footer className="dk-ad-space-footer">
      <div className="dk-billboard-container">
        <div className="dk-billboard-frame">
          <div className="dk-billboard-screen">
            <img
              src="/assets/sprites/ad_banner.png"
              alt="Espacio Publicitario"
              decoding="async"
              className="dk-ad-banner-img"
            />
            <div className="dk-ad-label-tag">DANMAKREW • NO MERCY GAMES</div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default memo(AdFooter);

