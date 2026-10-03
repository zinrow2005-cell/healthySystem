const CACHE='health-v16-2-3-mobile-appsscript-fix';
const ASSETS=["./", "index.html", "styles.css", "app.js", "health_intelligence.js", "multi_marker_engine.js", "sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon-32.png", "favicon-16.png", "health_rules_v15.json", "multi_marker_patterns_v16.json", "multi_marker_scenarios_v16.json", "scenario_tests_v15.json", "lab_reference_ranges_v15.json", "advice_rules_v15.json", "dynamic_lab_registry_v15.json", "custom_lab_profiles_v15.json", "lab_catalog_v15.json", "loinc_mapping_v15.json"];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;

  const url=new URL(request.url);

  // IMPORTANT:
  // Do not intercept Google Apps Script or any other cross-origin request.
  // iOS/PWA Safari can fail if a service worker tries to provide a cache
  // fallback for an external request and caches.match() returns undefined.
  if(url.origin!==self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response=>{
        if(response && response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy));
        }
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(request);
        if(cached) return cached;
        return new Response('Offline resource unavailable',{status:503,statusText:'Service Unavailable'});
      })
  );
});
