/* Renders the single public statistics file (stats.json) into the page. */
fetch('stats.json').then(function (r) { return r.json() }).then(function (s) {
  var u = document.getElementById('stat-users'), r = document.getElementById('stat-rating'), a = document.getElementById('stat-source')
  if (u && s.users) u.textContent = s.users
  if (r && s.rating) r.textContent = Number(s.rating).toFixed(1)
  var c = document.getElementById('stat-count'); if (c && s.ratingCount) c.textContent = Number(s.ratingCount).toLocaleString('en-US') + ' ratings'
  if (a) a.textContent = 'Source: ' + s.source + ', ' + s.asOf
}).catch(function () { /* the static fallback text stays */ })
