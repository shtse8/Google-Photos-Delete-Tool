/* GPDT landing tracking. gtag.js (GA4 + Google Ads) with Consent Mode v2.
   Ids come from config.json. While any id is a placeholder, no tag loads.
   Events carry no email, name or free text. Cookies and identifiers follow the visitor's choice. */
(function () {
  'use strict'
  var CWS = 'https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb'
  var PRO_VALUE = 9.99
  var STORE_KEY = 'gpdt_consent'
  var REGIONS = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH']
  var script = document.currentScript
  var page = (script && script.getAttribute('data-page')) || 'index'

  // Resolve a data file next to this script, so localised pages in /<lang>/ read the shared root files.
  function sibling(name) { return script && script.src ? new URL(name, script.src).href : name }

  function placeholder(v) { return !v || /X{4}/.test(String(v)) }
  function read() { try { return localStorage.getItem(STORE_KEY) } catch (e) { return null } }
  function write(k, v) { try { localStorage.setItem(k, v) } catch (e) { /* ignore */ } }
  // Choice: 'all' | 'analytics' | 'none'. Old values migrate: granted -> all, denied -> none.
  function normalize(v) {
    if (v === 'granted') return 'all'
    if (v === 'denied') return 'none'
    return v === 'all' || v === 'analytics' || v === 'none' ? v : null
  }
  function state(choice) {
    var ad = choice === 'all' ? 'granted' : 'denied'
    return { ad_storage: ad, ad_user_data: ad, ad_personalization: ad, analytics_storage: choice === 'none' ? 'denied' : 'granted' }
  }

  // UTM carry-through: the Add to Chrome link keeps this page's utm_* values.
  function carryUtm() {
    var links = document.querySelectorAll ? document.querySelectorAll('[data-cta="add-to-chrome"]') : []
    var params = []
    new URLSearchParams(location.search).forEach(function (val, key) {
      if (/^utm_[a-z_]+$/.test(key)) params.push([key, val.slice(0, 100)])
    })
    var all = Array.prototype.slice.call(links)
    var hero = document.getElementById('add-to-chrome')
    if (hero && all.indexOf(hero) < 0) all.push(hero)
    all.forEach(function (link) {
      var out = new URL(CWS)
      params.forEach(function (p) { out.searchParams.set(p[0], p[1]) })
      link.href = out.toString()
    })
  }

  // Paid-click attribution for Stripe: with "Accept all" only, the Google click id from this page's URL
  // rides on buy.stripe.com links as client_reference_id. Hrefs only; no listeners are added.
  function stripeRef(choice) {
    var links = document.querySelectorAll ? Array.prototype.slice.call(document.querySelectorAll('a[href^="https://buy.stripe.com/"]')) : []
    var gclid = new URLSearchParams(location.search).get('gclid') || ''
    var ok = /^[A-Za-z0-9_-]{1,200}$/.test(gclid)
    links.forEach(function (l) {
      var out = new URL(l.href)
      if (choice === 'all' && ok) out.searchParams.set('client_reference_id', gclid)
      else out.searchParams.delete('client_reference_id')
      l.href = out.toString()
    })
  }

  // The banner shows when no choice is stored, and reopens from the footer "Cookie settings" link.
  // Reopening marks the current choice (aria-pressed); a new choice updates consent at once.
  function banner(update, current, autoOpen) {
    var el = document.getElementById('consent')
    if (!el) return
    var cur = current
    function mark() {
      ;['all', 'analytics', 'none'].forEach(function (choice) {
        el.querySelector('[data-consent="' + choice + '"]').setAttribute('aria-pressed', choice === cur ? 'true' : 'false')
      })
    }
    ;['all', 'analytics', 'none'].forEach(function (choice) {
      el.querySelector('[data-consent="' + choice + '"]').addEventListener('click', function () {
        write(STORE_KEY, choice); cur = choice; update(choice); mark(); el.hidden = true
      })
    })
    var open = function () { mark(); el.hidden = false }
    var links = document.querySelectorAll ? Array.prototype.slice.call(document.querySelectorAll('[data-cookie-settings]')) : []
    var byId = document.getElementById('cookie-settings')
    if (byId && links.indexOf(byId) < 0) links.push(byId)
    links.forEach(function (l) { l.addEventListener('click', function (e) { if (e && e.preventDefault) e.preventDefault(); open() }) })
    if (!cur && autoOpen !== false) open()
  }

  function start(cfg) {
    var ga4 = cfg.ga4MeasurementId
    var ads = cfg.adsConversionId
    var useGa = !placeholder(ga4)
    var useAds = !placeholder(ads)
    if (!useGa && !useAds) { // placeholders: load nothing; Cookie settings still records a choice
      banner(function () {}, normalize(read()), false)
      return
    }

    window.dataLayer = window.dataLayer || []
    function gtag() { window.dataLayer.push(arguments) }
    window.gtag = gtag

    // Consent defaults go first, before gtag('config'). Most specific region rule first.
    gtag('consent', 'default', Object.assign(state('none'), { region: REGIONS, wait_for_update: 500 }))
    gtag('consent', 'default', state('all'))
    var raw = read()
    var saved = normalize(raw)
    if (saved && saved !== raw) write(STORE_KEY, saved)
    if (saved) gtag('consent', 'update', state(saved))
    gtag('set', 'ads_data_redaction', true)
    gtag('js', new Date())

    var params = { send_page_view: true }
    if (page === 'thanks') params.page_location = location.origin + location.pathname
    if (useGa) gtag('config', ga4, params)
    if (useAds) gtag('config', ads, page === 'thanks' ? { page_location: params.page_location } : {})

    var s = document.createElement('script')
    s.async = true
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(useGa ? ga4 : ads)
    document.head.appendChild(s)

    stripeRef(saved)
    banner(function (choice) { gtag('consent', 'update', state(choice)); stripeRef(choice) }, saved)

    var ctas = document.querySelectorAll ? Array.prototype.slice.call(document.querySelectorAll('[data-cta="add-to-chrome"]')) : []
    var heroCta = document.getElementById('add-to-chrome')
    if (heroCta && ctas.indexOf(heroCta) < 0) ctas.push(heroCta)
    ctas.forEach(function (el) {
      el.addEventListener('click', function () {
        gtag('event', 'add_to_chrome_click', { transport_type: 'beacon' })
        if (!placeholder(cfg.addToChromeSendTo)) gtag('event', 'conversion', { send_to: cfg.addToChromeSendTo, transport_type: 'beacon' })
      })
    })
    var pros = document.querySelectorAll ? Array.prototype.slice.call(document.querySelectorAll('[data-cta="pro"]')) : []
    pros.forEach(function (el) { el.addEventListener('click', function () { gtag('event', 'pro_click', { transport_type: 'beacon' }) }) })

    if (page === 'thanks') {
      var id = new URLSearchParams(location.search).get('session_id') || ''
      // Stripe session ids look like cs_live_...; the unreplaced template is not an id.
      if (/^cs_[A-Za-z0-9_]+$/.test(id) && id.length <= 200) {
        var seen = 'gpdt_purchase_' + id
        if (!read2(seen)) {
          write(seen, '1')
          gtag('event', 'purchase', { page_location: location.origin + location.pathname, transaction_id: id, value: PRO_VALUE, currency: 'USD' })
          if (!placeholder(cfg.purchaseSendTo)) gtag('event', 'conversion', { send_to: cfg.purchaseSendTo, transaction_id: id, value: PRO_VALUE, currency: 'USD' })
        }
      }
    }
  }
  function read2(k) { try { return localStorage.getItem(k) } catch (e) { return null } }

  // Self-serve checkout switch (config.json selfServeCheckout, shipped false): when true every Pro buy
  // link goes to checkoutUrl and the "Lost your licence?" link (recoverUrl) shows. Hrefs only.
  function checkout(cfg) {
    if (!cfg || cfg.selfServeCheckout !== true || !cfg.checkoutUrl) return
    var pros = document.querySelectorAll ? Array.prototype.slice.call(document.querySelectorAll('[data-cta="pro"]')) : []
    pros.forEach(function (el) { el.href = cfg.checkoutUrl })
    var rec = document.getElementById ? document.getElementById('recover') : null
    if (rec && cfg.recoverUrl) {
      var a = rec.querySelector('a')
      if (a) a.href = cfg.recoverUrl
      rec.hidden = false
    }
  }

  carryUtm()
  fetch(sibling('config.json'), { cache: 'no-cache' }).then(function (r) { return r.json() }).then(function (cfg) { try { checkout(cfg) } catch (e) { /* keep the current links */ } return start(cfg) }).catch(function () { /* no config: no tags */ })
})()
