/* Renders the single public statistics file (stats.json) into the page. */
(function () {
  var script = document.currentScript
  var url = script && script.src ? new URL('stats.json', script.src).href : 'stats.json'
  var lang = document.documentElement.lang || 'en'
  fetch(url).then(function (r) { return r.json() }).then(function (s) {
    var u = document.getElementById('stat-users'), r = document.getElementById('stat-rating'), a = document.getElementById('stat-source')
    if (u && s.users) u.textContent = s.users
    if (r && s.rating) r.textContent = Number(s.rating).toFixed(1)
    var c = document.getElementById('stat-count')
    if (lang === 'en') {
      if (c && s.ratingCount) c.textContent = Number(s.ratingCount).toLocaleString('en-US') + ' ratings'
      if (a) a.textContent = 'Source: ' + s.source + ', ' + s.asOf
    } else {
      // Localised pages carry translated text; only the number and the date are refreshed.
      if (c && s.ratingCount) c.textContent = c.textContent.replace(/[\d.,]+/, Number(s.ratingCount).toLocaleString(lang))
      if (a && s.asOf) a.textContent = a.textContent.replace(/\d{4}-\d{2}-\d{2}/, s.asOf)
    }
  }).catch(function () { /* the static fallback text stays */ })
})()
