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
    var link = document.getElementById('add-to-chrome')
    if (!link) return
    var out = new URL(CWS)
    new URLSearchParams(location.search).forEach(function (val, key) {
      if (/^utm_[a-z_]+$/.test(key)) out.searchParams.set(key, val.slice(0, 100))
    })
    link.href = out.toString()
  }

  function banner(update) {
    var el = document.getElementById('consent')
    if (!el) return
    el.hidden = false
    ;['all', 'analytics', 'none'].forEach(function (choice) {
      el.querySelector('[data-consent="' + choice + '"]').addEventListener('click', function () { write(STORE_KEY, choice); update(choice); el.hidden = true })
    })
  }

  function start(cfg) {
    var ga4 = cfg.ga4MeasurementId
    var ads = cfg.adsConversionId
    var useGa = !placeholder(ga4)
    var useAds = !placeholder(ads)
    if (!useGa && !useAds) return // placeholders: load nothing at all

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
    if (useAds) gtag('config', ads)

    var s = document.createElement('script')
    s.async = true
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(useGa ? ga4 : ads)
    document.head.appendChild(s)

    if (!saved) banner(function (choice) { gtag('consent', 'update', state(choice)) })

    var link = document.getElementById('add-to-chrome')
    if (link) {
      link.addEventListener('click', function () {
        gtag('event', 'add_to_chrome_click', { transport_type: 'beacon' })
        if (!placeholder(cfg.addToChromeSendTo)) gtag('event', 'conversion', { send_to: cfg.addToChromeSendTo, transport_type: 'beacon' })
      })
    }

    if (page === 'thanks') {
      var id = new URLSearchParams(location.search).get('session_id') || ''
      // Stripe session ids look like cs_live_...; the unreplaced template is not an id.
      if (/^cs_[A-Za-z0-9_]{8,200}$/.test(id)) {
        var seen = 'gpdt_purchase_' + id
        if (!read2(seen)) {
          write(seen, '1')
          gtag('event', 'purchase', { transaction_id: id, value: PRO_VALUE, currency: 'USD' })
          if (!placeholder(cfg.purchaseSendTo)) gtag('event', 'conversion', { send_to: cfg.purchaseSendTo, transaction_id: id, value: PRO_VALUE, currency: 'USD' })
        }
      }
    }
  }
  function read2(k) { try { return localStorage.getItem(k) } catch (e) { return null } }

  carryUtm()
  fetch('config.json', { cache: 'no-cache' }).then(function (r) { return r.json() }).then(start).catch(function () { /* no config: no tags */ })
})()
