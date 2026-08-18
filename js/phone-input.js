/* ======================================================================
   phone-input.js — shared international phone field helper
   ----------------------------------------------------------------------
   Builds a country-code <select> (full global list, flag + name + dial)
   next to a national-number <input>, and combines them into one stored
   value like "+91 9876543210".

   Public API (window.PhoneInput):
     initPhoneField(selectEl, inputEl, defaultIso)  -> build + wire digits-only
     buildCountrySelect(selectEl, defaultIso)       -> just populate the <select>
     getDigits(inputEl)                             -> national digits only
     getFullNumber(selectEl, inputEl)               -> "+<dial> <digits>" ("" if empty)
     isValidDigits(digits)                          -> true if 6..15 digits
     flagEmoji(iso2)                                -> "🇮🇳" (falls back to "" )

   Validation is intentionally flexible (6–15 digits) to support every
   country. Default selected country is India (+91).
   ====================================================================== */
(function (global) {
  'use strict';

  // { n: name, i: ISO-3166 alpha-2, d: dial code }
  var PHONE_COUNTRIES = [
    { n: 'Afghanistan', i: 'AF', d: '93' },
    { n: 'Albania', i: 'AL', d: '355' },
    { n: 'Algeria', i: 'DZ', d: '213' },
    { n: 'Andorra', i: 'AD', d: '376' },
    { n: 'Angola', i: 'AO', d: '244' },
    { n: 'Antigua and Barbuda', i: 'AG', d: '1268' },
    { n: 'Argentina', i: 'AR', d: '54' },
    { n: 'Armenia', i: 'AM', d: '374' },
    { n: 'Australia', i: 'AU', d: '61' },
    { n: 'Austria', i: 'AT', d: '43' },
    { n: 'Azerbaijan', i: 'AZ', d: '994' },
    { n: 'Bahamas', i: 'BS', d: '1242' },
    { n: 'Bahrain', i: 'BH', d: '973' },
    { n: 'Bangladesh', i: 'BD', d: '880' },
    { n: 'Barbados', i: 'BB', d: '1246' },
    { n: 'Belarus', i: 'BY', d: '375' },
    { n: 'Belgium', i: 'BE', d: '32' },
    { n: 'Belize', i: 'BZ', d: '501' },
    { n: 'Benin', i: 'BJ', d: '229' },
    { n: 'Bhutan', i: 'BT', d: '975' },
    { n: 'Bolivia', i: 'BO', d: '591' },
    { n: 'Bosnia and Herzegovina', i: 'BA', d: '387' },
    { n: 'Botswana', i: 'BW', d: '267' },
    { n: 'Brazil', i: 'BR', d: '55' },
    { n: 'Brunei', i: 'BN', d: '673' },
    { n: 'Bulgaria', i: 'BG', d: '359' },
    { n: 'Burkina Faso', i: 'BF', d: '226' },
    { n: 'Burundi', i: 'BI', d: '257' },
    { n: 'Cambodia', i: 'KH', d: '855' },
    { n: 'Cameroon', i: 'CM', d: '237' },
    { n: 'Canada', i: 'CA', d: '1' },
    { n: 'Cape Verde', i: 'CV', d: '238' },
    { n: 'Central African Republic', i: 'CF', d: '236' },
    { n: 'Chad', i: 'TD', d: '235' },
    { n: 'Chile', i: 'CL', d: '56' },
    { n: 'China', i: 'CN', d: '86' },
    { n: 'Colombia', i: 'CO', d: '57' },
    { n: 'Comoros', i: 'KM', d: '269' },
    { n: 'Congo (Brazzaville)', i: 'CG', d: '242' },
    { n: 'Congo (DRC)', i: 'CD', d: '243' },
    { n: 'Costa Rica', i: 'CR', d: '506' },
    { n: 'Croatia', i: 'HR', d: '385' },
    { n: 'Cuba', i: 'CU', d: '53' },
    { n: 'Cyprus', i: 'CY', d: '357' },
    { n: 'Czechia', i: 'CZ', d: '420' },
    { n: 'Denmark', i: 'DK', d: '45' },
    { n: 'Djibouti', i: 'DJ', d: '253' },
    { n: 'Dominica', i: 'DM', d: '1767' },
    { n: 'Dominican Republic', i: 'DO', d: '1809' },
    { n: 'Ecuador', i: 'EC', d: '593' },
    { n: 'Egypt', i: 'EG', d: '20' },
    { n: 'El Salvador', i: 'SV', d: '503' },
    { n: 'Equatorial Guinea', i: 'GQ', d: '240' },
    { n: 'Eritrea', i: 'ER', d: '291' },
    { n: 'Estonia', i: 'EE', d: '372' },
    { n: 'Eswatini', i: 'SZ', d: '268' },
    { n: 'Ethiopia', i: 'ET', d: '251' },
    { n: 'Fiji', i: 'FJ', d: '679' },
    { n: 'Finland', i: 'FI', d: '358' },
    { n: 'France', i: 'FR', d: '33' },
    { n: 'Gabon', i: 'GA', d: '241' },
    { n: 'Gambia', i: 'GM', d: '220' },
    { n: 'Georgia', i: 'GE', d: '995' },
    { n: 'Germany', i: 'DE', d: '49' },
    { n: 'Ghana', i: 'GH', d: '233' },
    { n: 'Greece', i: 'GR', d: '30' },
    { n: 'Grenada', i: 'GD', d: '1473' },
    { n: 'Guatemala', i: 'GT', d: '502' },
    { n: 'Guinea', i: 'GN', d: '224' },
    { n: 'Guinea-Bissau', i: 'GW', d: '245' },
    { n: 'Guyana', i: 'GY', d: '592' },
    { n: 'Haiti', i: 'HT', d: '509' },
    { n: 'Honduras', i: 'HN', d: '504' },
    { n: 'Hong Kong', i: 'HK', d: '852' },
    { n: 'Hungary', i: 'HU', d: '36' },
    { n: 'Iceland', i: 'IS', d: '354' },
    { n: 'India', i: 'IN', d: '91' },
    { n: 'Indonesia', i: 'ID', d: '62' },
    { n: 'Iran', i: 'IR', d: '98' },
    { n: 'Iraq', i: 'IQ', d: '964' },
    { n: 'Ireland', i: 'IE', d: '353' },
    { n: 'Israel', i: 'IL', d: '972' },
    { n: 'Italy', i: 'IT', d: '39' },
    { n: 'Ivory Coast', i: 'CI', d: '225' },
    { n: 'Jamaica', i: 'JM', d: '1876' },
    { n: 'Japan', i: 'JP', d: '81' },
    { n: 'Jordan', i: 'JO', d: '962' },
    { n: 'Kazakhstan', i: 'KZ', d: '7' },
    { n: 'Kenya', i: 'KE', d: '254' },
    { n: 'Kiribati', i: 'KI', d: '686' },
    { n: 'Kuwait', i: 'KW', d: '965' },
    { n: 'Kyrgyzstan', i: 'KG', d: '996' },
    { n: 'Laos', i: 'LA', d: '856' },
    { n: 'Latvia', i: 'LV', d: '371' },
    { n: 'Lebanon', i: 'LB', d: '961' },
    { n: 'Lesotho', i: 'LS', d: '266' },
    { n: 'Liberia', i: 'LR', d: '231' },
    { n: 'Libya', i: 'LY', d: '218' },
    { n: 'Liechtenstein', i: 'LI', d: '423' },
    { n: 'Lithuania', i: 'LT', d: '370' },
    { n: 'Luxembourg', i: 'LU', d: '352' },
    { n: 'Macau', i: 'MO', d: '853' },
    { n: 'Madagascar', i: 'MG', d: '261' },
    { n: 'Malawi', i: 'MW', d: '265' },
    { n: 'Malaysia', i: 'MY', d: '60' },
    { n: 'Maldives', i: 'MV', d: '960' },
    { n: 'Mali', i: 'ML', d: '223' },
    { n: 'Malta', i: 'MT', d: '356' },
    { n: 'Marshall Islands', i: 'MH', d: '692' },
    { n: 'Mauritania', i: 'MR', d: '222' },
    { n: 'Mauritius', i: 'MU', d: '230' },
    { n: 'Mexico', i: 'MX', d: '52' },
    { n: 'Micronesia', i: 'FM', d: '691' },
    { n: 'Moldova', i: 'MD', d: '373' },
    { n: 'Monaco', i: 'MC', d: '377' },
    { n: 'Mongolia', i: 'MN', d: '976' },
    { n: 'Montenegro', i: 'ME', d: '382' },
    { n: 'Morocco', i: 'MA', d: '212' },
    { n: 'Mozambique', i: 'MZ', d: '258' },
    { n: 'Myanmar', i: 'MM', d: '95' },
    { n: 'Namibia', i: 'NA', d: '264' },
    { n: 'Nauru', i: 'NR', d: '674' },
    { n: 'Nepal', i: 'NP', d: '977' },
    { n: 'Netherlands', i: 'NL', d: '31' },
    { n: 'New Zealand', i: 'NZ', d: '64' },
    { n: 'Nicaragua', i: 'NI', d: '505' },
    { n: 'Niger', i: 'NE', d: '227' },
    { n: 'Nigeria', i: 'NG', d: '234' },
    { n: 'North Korea', i: 'KP', d: '850' },
    { n: 'North Macedonia', i: 'MK', d: '389' },
    { n: 'Norway', i: 'NO', d: '47' },
    { n: 'Oman', i: 'OM', d: '968' },
    { n: 'Pakistan', i: 'PK', d: '92' },
    { n: 'Palau', i: 'PW', d: '680' },
    { n: 'Palestine', i: 'PS', d: '970' },
    { n: 'Panama', i: 'PA', d: '507' },
    { n: 'Papua New Guinea', i: 'PG', d: '675' },
    { n: 'Paraguay', i: 'PY', d: '595' },
    { n: 'Peru', i: 'PE', d: '51' },
    { n: 'Philippines', i: 'PH', d: '63' },
    { n: 'Poland', i: 'PL', d: '48' },
    { n: 'Portugal', i: 'PT', d: '351' },
    { n: 'Qatar', i: 'QA', d: '974' },
    { n: 'Romania', i: 'RO', d: '40' },
    { n: 'Russia', i: 'RU', d: '7' },
    { n: 'Rwanda', i: 'RW', d: '250' },
    { n: 'Saint Kitts and Nevis', i: 'KN', d: '1869' },
    { n: 'Saint Lucia', i: 'LC', d: '1758' },
    { n: 'Saint Vincent and the Grenadines', i: 'VC', d: '1784' },
    { n: 'Samoa', i: 'WS', d: '685' },
    { n: 'San Marino', i: 'SM', d: '378' },
    { n: 'Sao Tome and Principe', i: 'ST', d: '239' },
    { n: 'Saudi Arabia', i: 'SA', d: '966' },
    { n: 'Senegal', i: 'SN', d: '221' },
    { n: 'Serbia', i: 'RS', d: '381' },
    { n: 'Seychelles', i: 'SC', d: '248' },
    { n: 'Sierra Leone', i: 'SL', d: '232' },
    { n: 'Singapore', i: 'SG', d: '65' },
    { n: 'Slovakia', i: 'SK', d: '421' },
    { n: 'Slovenia', i: 'SI', d: '386' },
    { n: 'Solomon Islands', i: 'SB', d: '677' },
    { n: 'Somalia', i: 'SO', d: '252' },
    { n: 'South Africa', i: 'ZA', d: '27' },
    { n: 'South Korea', i: 'KR', d: '82' },
    { n: 'South Sudan', i: 'SS', d: '211' },
    { n: 'Spain', i: 'ES', d: '34' },
    { n: 'Sri Lanka', i: 'LK', d: '94' },
    { n: 'Sudan', i: 'SD', d: '249' },
    { n: 'Suriname', i: 'SR', d: '597' },
    { n: 'Sweden', i: 'SE', d: '46' },
    { n: 'Switzerland', i: 'CH', d: '41' },
    { n: 'Syria', i: 'SY', d: '963' },
    { n: 'Taiwan', i: 'TW', d: '886' },
    { n: 'Tajikistan', i: 'TJ', d: '992' },
    { n: 'Tanzania', i: 'TZ', d: '255' },
    { n: 'Thailand', i: 'TH', d: '66' },
    { n: 'Timor-Leste', i: 'TL', d: '670' },
    { n: 'Togo', i: 'TG', d: '228' },
    { n: 'Tonga', i: 'TO', d: '676' },
    { n: 'Trinidad and Tobago', i: 'TT', d: '1868' },
    { n: 'Tunisia', i: 'TN', d: '216' },
    { n: 'Turkey', i: 'TR', d: '90' },
    { n: 'Turkmenistan', i: 'TM', d: '993' },
    { n: 'Tuvalu', i: 'TV', d: '688' },
    { n: 'Uganda', i: 'UG', d: '256' },
    { n: 'Ukraine', i: 'UA', d: '380' },
    { n: 'United Arab Emirates', i: 'AE', d: '971' },
    { n: 'United Kingdom', i: 'GB', d: '44' },
    { n: 'United States', i: 'US', d: '1' },
    { n: 'Uruguay', i: 'UY', d: '598' },
    { n: 'Uzbekistan', i: 'UZ', d: '998' },
    { n: 'Vanuatu', i: 'VU', d: '678' },
    { n: 'Vatican City', i: 'VA', d: '379' },
    { n: 'Venezuela', i: 'VE', d: '58' },
    { n: 'Vietnam', i: 'VN', d: '84' },
    { n: 'Yemen', i: 'YE', d: '967' },
    { n: 'Zambia', i: 'ZM', d: '260' },
    { n: 'Zimbabwe', i: 'ZW', d: '263' }
  ];

  // "IN" -> 🇮🇳 (regional indicator symbols). Returns "" on unsupported input.
  function phoneFlagEmoji(iso2) {
    if (!iso2 || String(iso2).length !== 2) return '';
    try {
      var base = 0x1F1E6; // regional indicator 'A'
      var cc = String(iso2).toUpperCase();
      return String.fromCodePoint(
        base + cc.charCodeAt(0) - 65,
        base + cc.charCodeAt(1) - 65
      );
    } catch (e) { return ''; }
  }

  // Populate a <select> with all countries, sorted A→Z, defaultIso pre-selected.
  function buildPhoneCountrySelect(selectEl, defaultIso) {
    if (!selectEl) return;
    var def = String(defaultIso || 'IN').toUpperCase();
    var list = PHONE_COUNTRIES.slice().sort(function (a, b) {
      return a.n.localeCompare(b.n);
    });
    var html = '';
    for (var k = 0; k < list.length; k++) {
      var c = list[k];
      var flag = phoneFlagEmoji(c.i);
      // Dial code first (after the flag) so it stays visible even when the
      // fixed-width <select> truncates a long country name, e.g. "🇮🇳 +91 India".
      var label = (flag ? flag + ' ' : '') + '+' + c.d + ' ' + c.n;
      html += '<option value="' + c.d + '" data-iso="' + c.i + '"'
            + (c.i === def ? ' selected' : '') + '>' + label + '</option>';
    }
    selectEl.innerHTML = html;
  }

  // Keep only digits in the number input, cap length, mobile numeric keypad.
  function attachDigitsOnly(inputEl, maxLen) {
    if (!inputEl) return;
    var max = maxLen || 15;
    inputEl.setAttribute('inputmode', 'numeric');
    inputEl.setAttribute('maxlength', String(max));
    inputEl.addEventListener('input', function () {
      var cleaned = inputEl.value.replace(/[^0-9]/g, '');
      if (cleaned.length > max) cleaned = cleaned.slice(0, max);
      if (cleaned !== inputEl.value) inputEl.value = cleaned;
    });
  }

  function initPhoneField(selectEl, inputEl, defaultIso) {
    buildPhoneCountrySelect(selectEl, defaultIso);
    attachDigitsOnly(inputEl, 15);
  }

  function getPhoneDigits(inputEl) {
    if (!inputEl) return '';
    return String(inputEl.value || '').replace(/[^0-9]/g, '');
  }

  function isValidPhoneDigits(digits) {
    var d = String(digits || '').replace(/[^0-9]/g, '');
    return d.length >= 6 && d.length <= 15;
  }

  // Combined stored value, e.g. "+91 9876543210". "" when no number typed.
  function getFullPhoneNumber(selectEl, inputEl) {
    var digits = getPhoneDigits(inputEl);
    if (!digits) return '';
    var dial = (selectEl && selectEl.value)
      ? String(selectEl.value).replace(/[^0-9]/g, '') : '';
    return dial ? ('+' + dial + ' ' + digits) : digits;
  }

  global.PhoneInput = {
    COUNTRIES: PHONE_COUNTRIES,
    flagEmoji: phoneFlagEmoji,
    buildCountrySelect: buildPhoneCountrySelect,
    initPhoneField: initPhoneField,
    getDigits: getPhoneDigits,
    isValidDigits: isValidPhoneDigits,
    getFullNumber: getFullPhoneNumber
  };
})(typeof window !== 'undefined' ? window : this);
