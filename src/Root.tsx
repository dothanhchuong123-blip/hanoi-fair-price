import React, { useEffect, useState } from 'react';
import App from './App';
import { Guide } from './site/Guide';
import { Landing } from './site/Landing';
import { useRoute } from './site/router';
import { SiteHeader } from './site/SiteHeader';

const TITLES = {
  home: 'Chợ Price Lens · Fair prices in Hanoi',
  guide: 'Old Quarter price guide · Chợ Price Lens',
  app: 'Check a price · Chợ Price Lens',
};

export default function Root() {
  const route = useRoute();
  const [lang, setLang] = useState<'en' | 'vi'>(() => {
    try {
      return localStorage.getItem('cho_lang') === 'vi' ? 'vi' : 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cho_lang', lang);
    } catch {
      // Ignore
    }
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.title = TITLES[route.page];
  }, [route.page]);

  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader lang={lang} onChangeLang={setLang} route={route} hideOnMobile={route.page === 'app'} />
      {route.page === 'home' && <Landing lang={lang} />}
      {route.page === 'guide' && <Guide lang={lang} />}
      {route.page === 'app' && (
        <App lang={lang} setLang={setLang} start={route.start} dishId={route.dishId} />
      )}
    </div>
  );
}
