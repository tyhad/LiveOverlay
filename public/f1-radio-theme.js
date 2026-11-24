;(function (global) {
  'use strict'

  const NEUTRAL_TEAM = Object.freeze({
    id: 'f1',
    name: 'Formula 1',
    abbr: 'F1',
    colors: Object.freeze({
      primary: '#E10600',
      text: '#F8FAFC',
      bandBg: 'rgba(225, 6, 0, 0.16)',
      border: 'rgba(225, 6, 0, 0.65)',
      glow: 'rgba(225, 6, 0, 0.28)',
    }),
    keywords: [],
    caseSensitiveKeywords: [],
  })

  const TEAMS = {
    ferrari: {
      id: 'ferrari',
      name: 'Ferrari',
      abbr: 'FER',
      colors: {
        primary: '#E8002D',
        text: '#FF475C',
        bandBg: 'rgba(232, 0, 45, 0.18)',
        border: 'rgba(232, 0, 45, 0.72)',
        glow: 'rgba(232, 0, 45, 0.30)',
      },
      keywords: ['ferrari', 'scuderia', 'tifosi', 'maranello', 'prancing horse', 'forza ferrari', 'sf26', 'sf-26', 'fer'],
      caseSensitiveKeywords: [],
    },
    redbull: {
      id: 'redbull',
      name: 'Red Bull Racing',
      abbr: 'RBR',
      colors: {
        primary: '#3671C6',
        text: '#62A4FF',
        bandBg: 'rgba(54, 113, 198, 0.20)',
        border: 'rgba(54, 113, 198, 0.75)',
        glow: 'rgba(54, 113, 198, 0.30)',
      },
      keywords: ['red bull racing', 'red bull', 'redbull', 'rbr', 'milton keynes', 'rb22'],
      caseSensitiveKeywords: ['RB'],
    },
    mclaren: {
      id: 'mclaren',
      name: 'McLaren',
      abbr: 'MCL',
      colors: {
        primary: '#FF8000',
        text: '#FFA03B',
        bandBg: 'rgba(255, 128, 0, 0.18)',
        border: 'rgba(255, 128, 0, 0.75)',
        glow: 'rgba(255, 128, 0, 0.28)',
      },
      keywords: ['mclaren', 'papaya', 'woking', 'mcl'],
      caseSensitiveKeywords: [],
    },
    mercedes: {
      id: 'mercedes',
      name: 'Mercedes',
      abbr: 'MER',
      colors: {
        primary: '#27F4D2',
        text: '#57FFE4',
        bandBg: 'rgba(39, 244, 210, 0.15)',
        border: 'rgba(39, 244, 210, 0.70)',
        glow: 'rgba(39, 244, 210, 0.25)',
      },
      keywords: ['mercedes', 'merc', 'silver arrows', 'brackley', 'petronas', 'mer'],
      caseSensitiveKeywords: [],
    },
    astonmartin: {
      id: 'astonmartin',
      name: 'Aston Martin',
      abbr: 'AST',
      colors: {
        primary: '#229971',
        text: '#39DBA2',
        bandBg: 'rgba(34, 153, 113, 0.18)',
        border: 'rgba(34, 153, 113, 0.72)',
        glow: 'rgba(34, 153, 113, 0.26)',
      },
      keywords: ['aston martin', 'aston', 'amr', 'el plan', 'silverstone'],
      caseSensitiveKeywords: ['AST'],
    },
    alpine: {
      id: 'alpine',
      name: 'Alpine',
      abbr: 'ALP',
      colors: {
        primary: '#FF87BC',
        text: '#FFA6CE',
        bandBg: 'rgba(255, 135, 188, 0.16)',
        border: 'rgba(255, 135, 188, 0.72)',
        glow: 'rgba(0, 147, 204, 0.28)',
      },
      keywords: ['alpine', 'enstone', 'bwt alpine'],
      caseSensitiveKeywords: ['ALP'],
    },
    williams: {
      id: 'williams',
      name: 'Williams',
      abbr: 'WIL',
      colors: {
        primary: '#1868DB',
        text: '#529BFF',
        bandBg: 'rgba(24, 104, 219, 0.20)',
        border: 'rgba(24, 104, 219, 0.76)',
        glow: 'rgba(24, 104, 219, 0.30)',
      },
      keywords: ['williams', 'grove', 'weeyums', 'wil'],
      caseSensitiveKeywords: [],
    },
    racingbulls: {
      id: 'racingbulls',
      name: 'Racing Bulls',
      abbr: 'VCA',
      colors: {
        primary: '#6692FF',
        text: '#8EB0FF',
        bandBg: 'rgba(102, 146, 255, 0.18)',
        border: 'rgba(102, 146, 255, 0.72)',
        glow: 'rgba(102, 146, 255, 0.28)',
      },
      keywords: ['racing bulls', 'vcarb', 'vca', 'faenza', 'alphatauri'],
      caseSensitiveKeywords: [],
    },
    haas: {
      id: 'haas',
      name: 'Haas',
      abbr: 'HAA',
      colors: {
        primary: '#E6002B',
        text: '#E2E8F0',
        bandBg: 'rgba(182, 186, 189, 0.16)',
        border: 'rgba(226, 232, 240, 0.60)',
        glow: 'rgba(230, 0, 43, 0.26)',
      },
      keywords: ['haas', 'moneygram', 'haa'],
      caseSensitiveKeywords: [],
    },
    audi: {
      id: 'audi',
      name: 'Audi',
      abbr: 'AUD',
      colors: {
        primary: '#F50537',
        text: '#FF5472',
        bandBg: 'rgba(245, 5, 55, 0.16)',
        border: 'rgba(245, 5, 55, 0.72)',
        glow: 'rgba(245, 5, 55, 0.28)',
      },
      keywords: ['audi', 'sauber', 'kick sauber', 'hinwil', 'aud'],
      caseSensitiveKeywords: [],
    },
    cadillac: {
      id: 'cadillac',
      name: 'Cadillac',
      abbr: 'CAD',
      colors: {
        primary: '#C8A951',
        text: '#E6CA7A',
        bandBg: 'rgba(200, 169, 81, 0.18)',
        border: 'rgba(200, 169, 81, 0.72)',
        glow: 'rgba(200, 169, 81, 0.26)',
      },
      keywords: ['cadillac', 'andretti', 'cad'],
      caseSensitiveKeywords: [],
    },
  }

  /** Mapping nama tim dari /api/f1-data ke teamId internal. */
  const TEAM_NAME_TO_ID = {
    'ferrari': 'ferrari',
    'scuderia ferrari': 'ferrari',
    'red bull': 'redbull',
    'red bull racing': 'redbull',
    'mclaren': 'mclaren',
    'mercedes': 'mercedes',
    'aston martin': 'astonmartin',
    'alpine': 'alpine',
    'alpine f1 team': 'alpine',
    'williams': 'williams',
    'rb': 'racingbulls',
    'rb f1 team': 'racingbulls',
    'racing bulls': 'racingbulls',
    'vcarb': 'racingbulls',
    'haas': 'haas',
    'haas f1 team': 'haas',
    'audi': 'audi',
    'audi f1 team': 'audi',
    'sauber': 'audi',
    'kick sauber': 'audi',
    'cadillac': 'cadillac',
    'cadillac f1 team': 'cadillac',
  }

  /**
   * Abbr 3 huruf yang rawan bertabrakan dengan kata harian Indonesia/Inggris
   * (mis. "gas bang!", "per lap", "had", "law", "nor", "ham", "ant", "str", "alb", "lin").
   * Abbr di set ini hanya cocok jika ditulis HURUF BESAR penuh (contoh: "GAS P5!", "HAM vs LEC").
   */
  const AMBIGUOUS_ABBRS = new Set(['GAS', 'PER', 'HAD', 'LAW', 'NOR', 'HAM', 'ANT', 'STR', 'ALB', 'LIN'])

  /** Roster bawaan F1 2026 (22 pembalap). Tim bisa otomatis diselaraskan dari /api/f1-data. */
  const BUILTIN_DRIVERS = [
    // Ferrari
    {
      name: 'Charles Leclerc', shortName: 'LECLERC', number: '16', teamId: 'ferrari', abbr: 'LEC',
      keywords: ['charles leclerc', 'leclerc', 'charles', 'il predestinato', 'sharl', 'cl16', '#16', 'lec'],
      caseSensitiveKeywords: [],
    },
    {
      name: 'Lewis Hamilton', shortName: 'HAMILTON', number: '44', teamId: 'ferrari', abbr: 'HAM',
      keywords: ['lewis hamilton', 'hamilton', 'lewis', 'sir lewis', 'team lh', 'lh44', '#44'],
      caseSensitiveKeywords: ['HAM'],
    },
    // Red Bull Racing
    {
      name: 'Max Verstappen', shortName: 'VERSTAPPEN', number: '3', teamId: 'redbull', abbr: 'VER',
      keywords: ['max verstappen', 'verstappen', 'mad max', 'super max', 'max', 'mv1', 'mv3', 'mv33', '#3', '#33', 'ver'],
      caseSensitiveKeywords: [],
    },
    {
      name: 'Isack Hadjar', shortName: 'HADJAR', number: '6', teamId: 'redbull', abbr: 'HAD',
      keywords: ['isack hadjar', 'hadjar', 'isack', 'ih6', '#6'],
      caseSensitiveKeywords: ['HAD'],
    },
    // McLaren
    {
      name: 'Lando Norris', shortName: 'NORRIS', number: '1', teamId: 'mclaren', abbr: 'NOR',
      keywords: ['lando norris', 'norris', 'lando', 'ln1', 'ln4', '#1', '#4'],
      caseSensitiveKeywords: ['NOR'],
    },
    {
      name: 'Oscar Piastri', shortName: 'PIASTRI', number: '81', teamId: 'mclaren', abbr: 'PIA',
      keywords: ['oscar piastri', 'piastri', 'oscar', 'op81', '#81', 'pia'],
      caseSensitiveKeywords: [],
    },
    // Mercedes
    {
      name: 'George Russell', shortName: 'RUSSELL', number: '63', teamId: 'mercedes', abbr: 'RUS',
      keywords: ['george russell', 'russell', 'george', 'gr63', '#63', 'rus'],
      caseSensitiveKeywords: [],
    },
    {
      name: 'Kimi Antonelli', shortName: 'ANTONELLI', number: '12', teamId: 'mercedes', abbr: 'ANT',
      keywords: ['kimi antonelli', 'andrea kimi antonelli', 'antonelli', 'kimi', 'ka12', '#12'],
      caseSensitiveKeywords: ['ANT'],
    },
    // Aston Martin
    {
      name: 'Fernando Alonso', shortName: 'ALONSO', number: '14', teamId: 'astonmartin', abbr: 'ALO',
      keywords: ['fernando alonso', 'alonso', 'fernando', 'nando', 'fa14', '#14', 'alo'],
      caseSensitiveKeywords: [],
    },
    {
      name: 'Lance Stroll', shortName: 'STROLL', number: '18', teamId: 'astonmartin', abbr: 'STR',
      keywords: ['lance stroll', 'stroll', 'ls18', '#18'],
      caseSensitiveKeywords: ['STR'],
    },
    // Alpine
    {
      name: 'Pierre Gasly', shortName: 'GASLY', number: '10', teamId: 'alpine', abbr: 'GAS',
      keywords: ['pierre gasly', 'gasly', 'pierre', 'pg10', '#10'],
      caseSensitiveKeywords: ['GAS'],
    },
    {
      name: 'Franco Colapinto', shortName: 'COLAPINTO', number: '43', teamId: 'alpine', abbr: 'COL',
      keywords: ['franco colapinto', 'colapinto', 'franco', 'fc43', '#43', 'col'],
      caseSensitiveKeywords: [],
    },
    // Williams
    {
      name: 'Alex Albon', shortName: 'ALBON', number: '23', teamId: 'williams', abbr: 'ALB',
      keywords: ['alex albon', 'alexander albon', 'albon', 'albono', 'aa23', '#23'],
      caseSensitiveKeywords: ['ALB'],
    },
    {
      name: 'Carlos Sainz', shortName: 'SAINZ', number: '55', teamId: 'williams', abbr: 'SAI',
      keywords: ['carlos sainz', 'sainz', 'carlos', 'smooth operator', 'chili', 'cs55', '#55', 'sai'],
      caseSensitiveKeywords: [],
    },
    // Racing Bulls
    {
      name: 'Liam Lawson', shortName: 'LAWSON', number: '30', teamId: 'racingbulls', abbr: 'LAW',
      keywords: ['liam lawson', 'lawson', 'liam', 'll30', '#30'],
      caseSensitiveKeywords: ['LAW'],
    },
    {
      name: 'Arvid Lindblad', shortName: 'LINDBLAD', number: '41', teamId: 'racingbulls', abbr: 'LIN',
      keywords: ['arvid lindblad', 'lindblad', 'arvid', 'al41', '#41'],
      caseSensitiveKeywords: ['LIN'],
    },
    // Haas
    {
      name: 'Esteban Ocon', shortName: 'OCON', number: '31', teamId: 'haas', abbr: 'OCO',
      keywords: ['esteban ocon', 'ocon', 'esteban', 'eo31', '#31', 'oco'],
      caseSensitiveKeywords: [],
    },
    {
      name: 'Oliver Bearman', shortName: 'BEARMAN', number: '87', teamId: 'haas', abbr: 'BEA',
      keywords: ['oliver bearman', 'ollie bearman', 'bearman', 'ollie', 'ob87', '#87', 'bea'],
      caseSensitiveKeywords: [],
    },
    // Audi
    {
      name: 'Nico Hulkenberg', shortName: 'HULKENBERG', number: '27', teamId: 'audi', abbr: 'HUL',
      keywords: ['nico hulkenberg', 'hulkenberg', 'hulk', 'nh27', '#27', 'hul'],
      caseSensitiveKeywords: [],
    },
    {
      name: 'Gabriel Bortoleto', shortName: 'BORTOLETO', number: '5', teamId: 'audi', abbr: 'BOR',
      keywords: ['gabriel bortoleto', 'bortoleto', 'gb5', '#5', 'bor'],
      caseSensitiveKeywords: [],
    },
    // Cadillac
    {
      name: 'Sergio Perez', shortName: 'PEREZ', number: '11', teamId: 'cadillac', abbr: 'PER',
      keywords: ['sergio perez', 'perez', 'checo', 'sp11', '#11'],
      caseSensitiveKeywords: ['PER'],
    },
    {
      name: 'Valtteri Bottas', shortName: 'BOTTAS', number: '77', teamId: 'cadillac', abbr: 'BOT',
      keywords: ['valtteri bottas', 'bottas', 'valtteri', 'vb77', '#77', 'bot'],
      caseSensitiveKeywords: [],
    },
  ]

  function normalizeTeamId(rawTeamName) {
    const key = String(rawTeamName || '').trim().toLowerCase()
    if (!key) return null
    if (TEAMS[key]) return key
    if (TEAM_NAME_TO_ID[key]) return TEAM_NAME_TO_ID[key]
    for (const [alias, id] of Object.entries(TEAM_NAME_TO_ID)) {
      if (key.includes(alias)) return id
    }
    return null
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function dedupeStrings(arr) {
    const seen = new Set()
    const out = []
    for (const item of arr || []) {
      const s = String(item || '').trim()
      if (!s) continue
      const k = s.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(s)
    }
    return out
  }

  function dedupeCaseSensitive(arr) {
    const seen = new Set()
    const out = []
    for (const item of arr || []) {
      const s = String(item || '').trim()
      if (!s || seen.has(s)) continue
      seen.add(s)
      out.push(s)
    }
    return out
  }

  let cachedRegistry = null
  let cachedDriversRef = null
  let cachedCustomRef = null

  /**
   * Gabungkan roster bawaan F1 2026 + sinkronisasi live dari `/api/f1-data`
   * + keyword custom opsional dari `f1-radio-keywords.json`.
   */
  function buildRegistry(f1Drivers, customKeywords) {
    if (cachedRegistry && cachedDriversRef === f1Drivers && cachedCustomRef === customKeywords) {
      return cachedRegistry
    }

    const teams = {}
    for (const [id, team] of Object.entries(TEAMS)) {
      teams[id] = {
        ...team,
        keywords: [...team.keywords],
        caseSensitiveKeywords: [...team.caseSensitiveKeywords],
      }
    }

    const drivers = BUILTIN_DRIVERS.map((d) => ({
      ...d,
      keywords: [...d.keywords],
      caseSensitiveKeywords: [...d.caseSensitiveKeywords],
    }))

    const findDriverIndex = (name, abbr) => {
      const normName = String(name || '').trim().toLowerCase()
      const normAbbr = String(abbr || '').trim().toUpperCase()
      return drivers.findIndex((d) => {
        if (normAbbr && d.abbr && d.abbr.toUpperCase() === normAbbr) return true
        if (normName && d.name.toLowerCase() === normName) return true
        const last = normName.split(/\s+/).pop()
        return Boolean(last && last.length >= 4 && d.shortName.toLowerCase() === last)
      })
    }

    // 1. Sinkronisasi live dari /api/f1-data (driverStandings): update tim jika ada transfer,
    //    atau daftarkan pembalap baru otomatis.
    if (Array.isArray(f1Drivers)) {
      for (const row of f1Drivers) {
        if (!row || typeof row !== 'object') continue
        const teamId = normalizeTeamId(row.teamName)
        if (!teamId) continue
        const idx = findDriverIndex(row.driverName, row.driverAbbr)
        if (idx >= 0) {
          drivers[idx].teamId = teamId
        } else {
          const fullName = String(row.driverName || '').trim()
          const abbr = String(row.driverAbbr || '').trim().toUpperCase()
          const parts = fullName.split(/\s+/).filter(Boolean)
          const lastName = parts[parts.length - 1] || abbr || fullName
          if (!fullName && !abbr) continue
          const kw = []
          const csKw = []
          if (fullName) kw.push(fullName.toLowerCase())
          if (lastName && lastName.length >= 4) kw.push(lastName.toLowerCase())
          if (abbr) {
            if (AMBIGUOUS_ABBRS.has(abbr)) csKw.push(abbr)
            else kw.push(abbr.toLowerCase())
          }
          drivers.push({
            name: fullName || abbr,
            shortName: lastName.toUpperCase(),
            number: row.driverNumber ? String(row.driverNumber) : '',
            teamId,
            abbr,
            keywords: dedupeStrings(kw),
            caseSensitiveKeywords: dedupeCaseSensitive(csKw),
          })
        }
      }
    }

    // 2. Keyword custom manual dari f1-radio-keywords.json
    if (customKeywords && typeof customKeywords === 'object') {
      if (customKeywords.teams && typeof customKeywords.teams === 'object') {
        for (const [rawId, list] of Object.entries(customKeywords.teams)) {
          const teamId = normalizeTeamId(rawId)
          if (!teamId || !teams[teamId] || !Array.isArray(list)) continue
          teams[teamId].keywords = dedupeStrings([...teams[teamId].keywords, ...list])
        }
      }
      if (Array.isArray(customKeywords.drivers)) {
        for (const entry of customKeywords.drivers) {
          if (!entry || typeof entry !== 'object') continue
          const teamId = normalizeTeamId(entry.teamId)
          if (!teamId) continue
          const idx = findDriverIndex(entry.name, entry.abbr)
          const extraKw = Array.isArray(entry.keywords) ? entry.keywords : []
          const extraCs = Array.isArray(entry.caseSensitiveKeywords) ? entry.caseSensitiveKeywords : []
          if (idx >= 0) {
            drivers[idx].teamId = teamId
            if (entry.number) drivers[idx].number = String(entry.number)
            if (entry.shortName) drivers[idx].shortName = String(entry.shortName).toUpperCase()
            drivers[idx].keywords = dedupeStrings([...drivers[idx].keywords, ...extraKw])
            drivers[idx].caseSensitiveKeywords = dedupeCaseSensitive([...drivers[idx].caseSensitiveKeywords, ...extraCs])
          } else if (entry.name) {
            const parts = String(entry.name).trim().split(/\s+/).filter(Boolean)
            const last = (entry.shortName || parts[parts.length - 1] || entry.name).toUpperCase()
            const baseKw = [String(entry.name).trim().toLowerCase()]
            if (last.length >= 4) baseKw.push(last.toLowerCase())
            if (entry.number) baseKw.push(`#${entry.number}`)
            drivers.push({
              name: String(entry.name).trim(),
              shortName: last,
              number: entry.number ? String(entry.number) : '',
              teamId,
              abbr: entry.abbr ? String(entry.abbr).trim().toUpperCase() : '',
              keywords: dedupeStrings([...baseKw, ...extraKw]),
              caseSensitiveKeywords: dedupeCaseSensitive(extraCs),
            })
          }
        }
      }
    }

    // Kompilasi matcher sekali untuk performa tinggi (<0.1ms per chat).
    const rules = []
    const commandMap = new Map()
    commandMap.set('f1', { teamId: 'f1', driver: null })

    const registerCommand = (token, entry) => {
      const clean = String(token || '').trim().replace(/^#/, '').toLowerCase()
      if (!clean || /\s/.test(clean) || commandMap.has(clean)) return
      commandMap.set(clean, entry)
    }

    for (const driver of drivers) {
      const driverRef = {
        name: driver.name,
        shortName: driver.shortName,
        number: driver.number || '',
        abbr: driver.abbr || '',
      }
      const cmdEntry = { teamId: driver.teamId, driver: driverRef }
      if (driver.number) registerCommand(driver.number, cmdEntry)
      if (driver.abbr) registerCommand(driver.abbr, cmdEntry)
      if (driver.shortName) registerCommand(driver.shortName, cmdEntry)
      for (const kw of driver.keywords) {
        rules.push(compileRule(kw, false, driver.teamId, driverRef))
        registerCommand(kw, cmdEntry)
      }
      for (const kw of driver.caseSensitiveKeywords) {
        rules.push(compileRule(kw, true, driver.teamId, driverRef))
        registerCommand(kw, cmdEntry)
      }
    }
    for (const team of Object.values(teams)) {
      const cmdEntry = { teamId: team.id, driver: null }
      registerCommand(team.id, cmdEntry)
      registerCommand(team.abbr, cmdEntry)
      for (const kw of team.keywords) {
        rules.push(compileRule(kw, false, team.id, null))
        registerCommand(kw, cmdEntry)
      }
      for (const kw of team.caseSensitiveKeywords) {
        rules.push(compileRule(kw, true, team.id, null))
        registerCommand(kw, cmdEntry)
      }
    }

    cachedRegistry = { teams, drivers, rules, commandMap }
    cachedDriversRef = f1Drivers
    cachedCustomRef = customKeywords
    return cachedRegistry
  }

  function compileRule(keyword, caseSensitive, teamId, driver) {
    const clean = String(keyword || '').trim()
    const escaped = escapeRegex(clean)
    const startsWithHash = clean.startsWith('#')
    // Boundary berbasis alfanumerik (bukan \b biasa karena '#' dan '_' perlu ditangani khusus):
    // '_' dianggap pemisah token agar username `tifosi_leclerc` tetap cocok dengan word boundary!
    const prefix = startsWithHash ? '(?:^|[^a-zA-Z0-9])' : '(?:^|[^a-zA-Z0-9])'
    const suffix = '(?=$|[^a-zA-Z0-9])'
    const flags = caseSensitive ? 'g' : 'gi'
    return {
      keyword: clean,
      lower: clean.toLowerCase(),
      length: clean.length,
      caseSensitive,
      teamId,
      driver,
      // Keyword panjang (>=5 huruf, tanpa #) boleh cocok sebagai substring di username menyatu (mis. `ferrarifan99`).
      allowUsernameSubstring: !caseSensitive && !startsWithHash && clean.length >= 5 && /^[a-z0-9\s-]+$/i.test(clean),
      boundaryRegex: new RegExp(`${prefix}(${escaped})${suffix}`, flags),
    }
  }

  /**
   * Pisahkan username menyatu agar camelCase / angka di ujung (mis. `TifosiLeclerc16`)
   * tetap punya batas kata yang bersih saat dicek, tanpa merusak kombinasi kode `LH44`/`CL16`.
   */
  function normalizeUsernameForTokens(raw) {
    const str = String(raw || '')
    // Sisipkan spasi pada batas camelCase (aB -> a B) dan huruf->angka hanya untuk versi tokenisasi tambahan.
    const camelSplit = str.replace(/([a-z])([A-Z])/g, '$1 $2')
    const alphaDigitSplit = camelSplit.replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z])/g, '$1 $2')
    return { raw: str, camelSplit, alphaDigitSplit }
  }

  function findRuleMatchIndex(text, rule) {
    rule.boundaryRegex.lastIndex = 0
    const m = rule.boundaryRegex.exec(text)
    if (!m) return -1
    // Hitung indeks awal dari grup tangkapan (keyword sebenarnya, bukan karakter separator sebelumnya).
    const full = m[0]
    const captured = m[1]
    const offset = full.length - captured.length
    return m.index + offset
  }

  /**
   * Pindai satu field (`author` atau `message`) dan kembalikan match terbaik:
   * - Indeks paling awal (paling kiri) menang.
   * - Jika indeks sama, keyword terpanjang menang, lalu driver lebih diprioritaskan dari tim.
   * - Jika pemenang hanya team-only tetapi di teks yang sama ada driver dari TIM YANG SAMA,
   *   upgrade `driver`-nya agar nomor driver ikut tampil.
   */
  function scanField(text, registry, isUsername) {
    const raw = String(text || '')
    if (!raw.trim()) return null

    const matches = []
    const lowerRaw = raw.toLowerCase()
    const userForms = isUsername ? normalizeUsernameForTokens(raw) : null

    for (const rule of registry.rules) {
      let idx = findRuleMatchIndex(raw, rule)

      if (idx === -1 && isUsername && userForms) {
        // Cek versi split camelCase (mempertahankan kode seperti LH44, CL16, MV3)
        idx = findRuleMatchIndex(userForms.camelSplit, rule)
        // Cek versi split huruf/angka (mis. `Leclerc16` -> `Leclerc 16`)
        if (idx === -1 && !/\d/.test(rule.keyword)) {
          idx = findRuleMatchIndex(userForms.alphaDigitSplit, rule)
        }
        // Cek substring untuk keyword panjang tidak ambigu di username menyatu (mis. `ferrarifan99`, `saya_leclercmania`)
        if (idx === -1 && rule.allowUsernameSubstring) {
          idx = lowerRaw.indexOf(rule.lower)
        }
      }

      if (idx !== -1) {
        matches.push({
          index: idx,
          length: rule.length,
          teamId: rule.teamId,
          driver: rule.driver,
          keyword: rule.keyword,
        })
      }
    }

    if (matches.length === 0) return null

    matches.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index
      if (a.length !== b.length) return b.length - a.length
      if (Boolean(a.driver) !== Boolean(b.driver)) return a.driver ? -1 : 1
      return 0
    })

    const winner = { ...matches[0] }
    if (!winner.driver) {
      const sameTeamDriver = matches.find((m) => m.teamId === winner.teamId && m.driver)
      if (sameTeamDriver) winner.driver = sameTeamDriver.driver
    }
    return winner
  }

  function parseBangCommand(message, registry) {
    const raw = String(message || '')
    const match = /^\s*!([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(raw)
    if (!match) return null
    const token = match[1].toLowerCase()
    const entry = registry.commandMap?.get(token)
    if (!entry) return null
    const rest = (match[2] || '').trim()
    return {
      teamId: entry.teamId,
      driver: entry.driver,
      command: `!${match[1]}`,
      // Jika setelah `!12` kosong, pertahankan pesan asli agar kartu tidak kosong melompong.
      displayMessage: rest || raw.trim(),
    }
  }

  function buildResult(team, matched, matchedBy, matchedKeyword, driver, logos, displayMessage) {
    const logoMap = logos && typeof logos === 'object' ? logos : {}
    const logoUrl = logoMap[team.id] || `/f1-logos/${team.id}.svg`
    return {
      teamId: team.id,
      teamName: team.name,
      teamAbbr: team.abbr,
      matched,
      matchedBy,
      matchedKeyword: matchedKeyword || '',
      driver: driver ? { ...driver } : null,
      colors: { ...team.colors },
      logoUrl,
      displayMessage: displayMessage !== undefined ? displayMessage : '',
    }
  }

  /**
   * Tentukan tema F1 Team Radio untuk satu pesan chat.
   * Prioritas:
   * 0. Perintah eksplisit `!` di awal chat (mis. `!12 keren anto`, `!ferrari gas!`, `!f1 halo`).
   *    Prefix `!command` otomatis dikupas dari `displayMessage` bila ada teks lanjutan.
   * 1. Username (`author`) dicek lebih dulu.
   *    - Jika username match tim saja, tapi isi chat menyebut driver dari TIM YANG SAMA,
   *      driver tersebut ikut dipasang agar nomor driver tampil.
   * 2. Jika username tidak match, isi chat (`message`) dicek (mention paling awal menang).
   * 3. Jika keduanya tidak match, fallback ke tema netral F1 (`teamId: 'f1'`).
   */
  function resolveF1RadioTheme(author, message, options) {
    const opts = options && typeof options === 'object' ? options : {}
    const registry = buildRegistry(opts.f1Drivers, opts.customKeywords)
    const logos = opts.f1Logos || {}
    const rawMsg = String(message || '').trim()

    const cmd = parseBangCommand(message, registry)
    if (cmd) {
      const team = registry.teams[cmd.teamId] || NEUTRAL_TEAM
      return buildResult(team, cmd.teamId !== 'f1', 'command', cmd.command, cmd.driver, logos, cmd.displayMessage)
    }

    const authorMatch = scanField(author, registry, true)
    if (authorMatch) {
      let driver = authorMatch.driver
      if (!driver && message) {
        const msgMatch = scanField(message, registry, false)
        if (msgMatch && msgMatch.teamId === authorMatch.teamId && msgMatch.driver) {
          driver = msgMatch.driver
        }
      }
      const team = registry.teams[authorMatch.teamId] || NEUTRAL_TEAM
      return buildResult(team, true, 'author', authorMatch.keyword, driver, logos, rawMsg)
    }

    const msgMatch = scanField(message, registry, false)
    if (msgMatch) {
      const team = registry.teams[msgMatch.teamId] || NEUTRAL_TEAM
      return buildResult(team, true, 'message', msgMatch.keyword, msgMatch.driver, logos, rawMsg)
    }

    return buildResult(NEUTRAL_TEAM, false, 'none', '', null, logos, rawMsg)
  }

  /** Preset contoh chat untuk dropdown preview di Editor. */
  const EDITOR_PREVIEW_PRESETS = Object.freeze({
    auto: null,
    ferrari: { platform: 'tiktok', author: 'Tifosi_Leclerc16', message: 'Box box! Strategi ban merah kali ini gacor banget!' },
    redbull: { platform: 'youtube', author: 'SuperMax_ID', message: 'Verstappen sektor 2 ungu semua bro!' },
    mclaren: { platform: 'tiktok', author: 'PapayaFan_81', message: 'Piastri overtake di tikungan 1 mulus banget!' },
    mercedes: { platform: 'youtube', author: 'SilverArrow63', message: 'Russell pace race-nya stabil parah di stint ini' },
    williams: { platform: 'tiktok', author: 'Albono_23', message: 'Williams poin ganda yuk malam ini!' },
    haas: { platform: 'tiktok', author: 'OllieBearman87', message: 'Nice one Ollie! Langsung masuk Q3!' },
    astonmartin: { platform: 'youtube', author: 'ElPlan_14', message: 'Alonso bertahan 20 lap di DRS train!' },
    alpine: { platform: 'tiktok', author: 'EnstoneCrew', message: 'Gasly start P8, siap serang di lap pertama!' },
    racingbulls: { platform: 'youtube', author: 'VCARB_Fans', message: 'Lawson late braking mantap banget!' },
    audi: { platform: 'tiktok', author: 'Hulk27_Audi', message: 'Audi debut musim ini langsung kompetitif!' },
    cadillac: { platform: 'youtube', author: 'Checo_11', message: 'Cadillac masuk grid F1, mantap Perez!' },
    teamOnly: { platform: 'tiktok', author: 'ScuderiaJakarta', message: 'Forza Ferrari! Semoga podium hari ini!' },
    neutral: { platform: 'tiktok', author: 'PenontonSetia', message: 'Halo bang! Live-nya jernih banget, gas terus sampai finish!' },
  })

  const api = {
    NEUTRAL_TEAM,
    TEAMS,
    BUILTIN_DRIVERS,
    EDITOR_PREVIEW_PRESETS,
    normalizeTeamId,
    buildRegistry,
    resolveF1RadioTheme,
  }

  global.F1RadioTheme = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
