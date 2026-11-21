/* Offline reference places for "nearest place" text: major cities plus well-known dark-sky and landmark spots. */
(function (root) {
"use strict";
const RAW = `New York|US|40.71|-74.01
Los Angeles|US|34.05|-118.24
Chicago|US|41.88|-87.63
Houston|US|29.76|-95.37
Phoenix|US|33.45|-112.07
Philadelphia|US|39.95|-75.17
San Antonio|US|29.42|-98.49
San Diego|US|32.72|-117.16
Dallas|US|32.78|-96.80
Austin|US|30.27|-97.74
Jacksonville|US|30.33|-81.66
Columbus|US|39.96|-83.00
Charlotte|US|35.23|-80.84
Indianapolis|US|39.77|-86.16
San Francisco|US|37.77|-122.42
Seattle|US|47.61|-122.33
Denver|US|39.74|-104.99
Washington|US|38.91|-77.04
Boston|US|42.36|-71.06
Nashville|US|36.16|-86.78
Detroit|US|42.33|-83.05
Oklahoma City|US|35.47|-97.52
Portland|US|45.52|-122.68
Las Vegas|US|36.17|-115.14
Memphis|US|35.15|-90.05
Louisville|US|38.25|-85.76
Milwaukee|US|43.04|-87.91
Albuquerque|US|35.08|-106.65
Tucson|US|32.22|-110.97
Fresno|US|36.74|-119.79
Sacramento|US|38.58|-121.49
Kansas City|US|39.10|-94.58
Atlanta|US|33.75|-84.39
Miami|US|25.76|-80.19
Minneapolis|US|44.98|-93.27
New Orleans|US|29.95|-90.07
Salt Lake City|US|40.76|-111.89
St. Louis|US|38.63|-90.20
Pittsburgh|US|40.44|-80.00
Cincinnati|US|39.10|-84.51
Omaha|US|41.26|-95.93
Boise|US|43.62|-116.20
Billings|US|45.78|-108.50
Fargo|US|46.88|-96.79
Sioux Falls|US|43.55|-96.73
Rapid City|US|44.08|-103.23
Cheyenne|US|41.14|-104.82
Amarillo|US|35.22|-101.83
El Paso|US|31.76|-106.49
Midland|US|31.99|-102.08
Flagstaff|US|35.20|-111.65
Reno|US|39.53|-119.81
Spokane|US|47.66|-117.43
Anchorage|US|61.22|-149.90
Fairbanks|US|64.84|-147.72
Honolulu|US|21.31|-157.86
Hilo|US|19.72|-155.09
Raleigh|US|35.78|-78.64
Tampa|US|27.95|-82.46
Orlando|US|28.54|-81.38
Birmingham|US|33.52|-86.80
Little Rock|US|34.75|-92.29
Des Moines|US|41.59|-93.62
Wichita|US|37.69|-97.34
Buffalo|US|42.89|-78.88
Portland (Maine)|US|43.66|-70.26
Champaign|US|40.12|-88.24
Urbana|US|40.11|-88.21
Bloomington (Illinois)|US|40.48|-88.99
Peoria|US|40.69|-89.59
Springfield (Illinois)|US|39.80|-89.64
Rockford|US|42.27|-89.09
Lafayette (Indiana)|US|40.42|-86.88
Bloomington (Indiana)|US|39.17|-86.53
Fort Wayne|US|41.08|-85.14
South Bend|US|41.68|-86.25
Iowa City|US|41.66|-91.53
Cedar Rapids|US|41.98|-91.67
Madison|US|43.07|-89.40
Green Bay|US|44.51|-88.02
Ann Arbor|US|42.28|-83.74
Lansing|US|42.73|-84.56
Grand Rapids|US|42.96|-85.67
Toledo|US|41.65|-83.54
Cleveland|US|41.50|-81.69
Dayton|US|39.76|-84.19
Lexington|US|38.04|-84.50
Knoxville|US|35.96|-83.92
Chattanooga|US|35.05|-85.31
Columbia (Missouri)|US|38.95|-92.33
Springfield (Missouri)|US|37.21|-93.29
Lawrence|US|38.97|-95.24
Lincoln|US|40.81|-96.70
Ames|US|42.03|-93.62
Stillwater|US|36.12|-97.06
Norman|US|35.22|-97.44
Lubbock|US|33.58|-101.86
College Station|US|30.63|-96.33
Baton Rouge|US|30.45|-91.15
Gainesville|US|29.65|-82.32
Tallahassee|US|30.44|-84.28
Athens (Georgia)|US|33.95|-83.38
Savannah|US|32.08|-81.09
Charleston|US|32.78|-79.93
Columbia (South Carolina)|US|34.00|-81.03
Durham|US|35.99|-78.90
Richmond|US|37.54|-77.44
Charlottesville|US|38.03|-78.48
Baltimore|US|39.29|-76.61
State College|US|40.79|-77.86
Ithaca|US|42.44|-76.50
Syracuse|US|43.05|-76.15
Albany|US|42.65|-73.76
Burlington|US|44.48|-73.21
Hartford|US|41.77|-72.67
Providence|US|41.82|-71.41
Boulder|US|40.01|-105.27
Fort Collins|US|40.59|-105.08
Colorado Springs|US|38.83|-104.82
Santa Fe|US|35.69|-105.94
Provo|US|40.23|-111.66
Bozeman|US|45.68|-111.04
Missoula|US|46.87|-113.99
Eugene|US|44.05|-123.09
Bend|US|44.06|-121.31
Santa Barbara|US|34.42|-119.70
San Luis Obispo|US|35.28|-120.66
Bakersfield|US|35.37|-119.02
Palm Springs|US|33.83|-116.55
Waterloo (Ontario)|CA|43.46|-80.52
Kingston (Ontario)|CA|44.23|-76.49
Victoria|CA|48.43|-123.37
Oxford|GB|51.75|-1.26
Cambridge|GB|52.21|0.12
Heidelberg|DE|49.40|8.67
Leiden|NL|52.16|4.49
Uppsala|SE|59.86|17.64
Grand Canyon Village|US|36.05|-112.14
Moab|US|38.57|-109.55
Death Valley (Furnace Creek)|US|36.46|-116.87
Big Bend National Park|US|29.25|-103.25
Yellowstone (Old Faithful)|US|44.46|-110.83
Toronto|CA|43.65|-79.38
Montreal|CA|45.50|-73.57
Vancouver|CA|49.28|-123.12
Calgary|CA|51.05|-114.07
Edmonton|CA|53.55|-113.49
Ottawa|CA|45.42|-75.70
Winnipeg|CA|49.90|-97.14
Quebec City|CA|46.81|-71.21
Halifax|CA|44.65|-63.57
Saskatoon|CA|52.13|-106.67
Regina|CA|50.45|-104.61
Whitehorse|CA|60.72|-135.06
Yellowknife|CA|62.45|-114.37
Iqaluit|CA|63.75|-68.52
Jasper|CA|52.88|-118.08
Mexico City|MX|19.43|-99.13
Guadalajara|MX|20.67|-103.35
Monterrey|MX|25.69|-100.32
Tijuana|MX|32.51|-117.04
Cancún|MX|21.16|-86.85
Hermosillo|MX|29.07|-110.96
Chihuahua|MX|28.63|-106.07
La Paz (Baja)|MX|24.14|-110.31
Oaxaca|MX|17.07|-96.73
Mérida|MX|20.97|-89.62
Guatemala City|GT|14.63|-90.51
San José|CR|9.93|-84.08
Panama City|PA|8.98|-79.52
Havana|CU|23.11|-82.37
Santo Domingo|DO|18.49|-69.93
San Juan|PR|18.47|-66.11
Kingston|JM|17.97|-76.79
Bogotá|CO|4.71|-74.07
Medellín|CO|6.24|-75.58
Caracas|VE|10.48|-66.90
Quito|EC|-0.18|-78.47
Guayaquil|EC|-2.19|-79.89
Lima|PE|-12.05|-77.04
Cusco|PE|-13.53|-71.97
Arequipa|PE|-16.41|-71.54
La Paz|BO|-16.49|-68.12
Uyuni|BO|-20.46|-66.83
Santiago|CL|-33.45|-70.67
Antofagasta|CL|-23.65|-70.40
San Pedro de Atacama|CL|-22.91|-68.20
La Serena|CL|-29.90|-71.25
Punta Arenas|CL|-53.16|-70.91
Puerto Montt|CL|-41.47|-72.94
Buenos Aires|AR|-34.60|-58.38
Córdoba|AR|-31.42|-64.18
Mendoza|AR|-32.89|-68.84
Salta|AR|-24.79|-65.41
Bariloche|AR|-41.13|-71.31
Ushuaia|AR|-54.80|-68.30
El Calafate|AR|-50.34|-72.27
Montevideo|UY|-34.90|-56.16
Asunción|PY|-25.26|-57.58
São Paulo|BR|-23.55|-46.63
Rio de Janeiro|BR|-22.91|-43.17
Brasília|BR|-15.79|-47.88
Salvador|BR|-12.97|-38.50
Fortaleza|BR|-3.73|-38.53
Recife|BR|-8.05|-34.88
Manaus|BR|-3.12|-60.02
Belém|BR|-1.46|-48.49
Porto Alegre|BR|-30.03|-51.23
Curitiba|BR|-25.43|-49.27
Belo Horizonte|BR|-19.92|-43.94
Cuiabá|BR|-15.60|-56.10
London|GB|51.51|-0.13
Edinburgh|GB|55.95|-3.19
Glasgow|GB|55.86|-4.25
Manchester|GB|53.48|-2.24
Cardiff|GB|51.48|-3.18
Belfast|GB|54.60|-5.93
Inverness|GB|57.48|-4.22
Dublin|IE|53.35|-6.26
Galway|IE|53.27|-9.05
Paris|FR|48.86|2.35
Lyon|FR|45.76|4.84
Marseille|FR|43.30|5.37
Toulouse|FR|43.60|1.44
Bordeaux|FR|44.84|-0.58
Nantes|FR|47.22|-1.55
Strasbourg|FR|48.57|7.75
Nice|FR|43.70|7.27
Madrid|ES|40.42|-3.70
Barcelona|ES|41.39|2.17
Valencia|ES|39.47|-0.38
Seville|ES|37.39|-5.98
Bilbao|ES|43.26|-2.93
Santa Cruz de Tenerife|ES|28.46|-16.25
Las Palmas|ES|28.12|-15.43
La Palma (Roque de los Muchachos)|ES|28.76|-17.89
Lisbon|PT|38.72|-9.14
Porto|PT|41.15|-8.61
Alqueva Dark Sky Reserve|PT|38.38|-7.47
Ponta Delgada (Azores)|PT|37.74|-25.67
Funchal (Madeira)|PT|32.65|-16.91
Rome|IT|41.90|12.50
Milan|IT|45.46|9.19
Naples|IT|40.85|14.27
Turin|IT|45.07|7.69
Florence|IT|43.77|11.26
Venice|IT|45.44|12.32
Palermo|IT|38.12|13.36
Cagliari|IT|39.22|9.12
Bari|IT|41.12|16.87
Berlin|DE|52.52|13.40
Hamburg|DE|53.55|9.99
Munich|DE|48.14|11.58
Cologne|DE|50.94|6.96
Frankfurt|DE|50.11|8.68
Stuttgart|DE|48.78|9.18
Dresden|DE|51.05|13.74
Amsterdam|NL|52.37|4.90
Brussels|BE|50.85|4.35
Luxembourg|LU|49.61|6.13
Zurich|CH|47.38|8.54
Geneva|CH|46.20|6.14
Zermatt|CH|46.02|7.75
Vienna|AT|48.21|16.37
Innsbruck|AT|47.27|11.39
Prague|CZ|50.08|14.44
Warsaw|PL|52.23|21.01
Kraków|PL|50.06|19.94
Gdańsk|PL|54.35|18.65
Budapest|HU|47.50|19.04
Bratislava|SK|48.15|17.11
Ljubljana|SI|46.06|14.51
Zagreb|HR|45.81|15.98
Split|HR|43.51|16.44
Belgrade|RS|44.79|20.45
Sarajevo|BA|43.86|18.41
Sofia|BG|42.70|23.32
Bucharest|RO|44.43|26.10
Cluj-Napoca|RO|46.77|23.59
Athens|GR|37.98|23.73
Thessaloniki|GR|40.64|22.94
Heraklion (Crete)|GR|35.34|25.13
Santorini|GR|36.39|25.46
Istanbul|TR|41.01|28.98
Ankara|TR|39.93|32.86
Izmir|TR|38.42|27.14
Antalya|TR|36.90|30.70
Cappadocia (Göreme)|TR|38.64|34.83
Copenhagen|DK|55.68|12.57
Oslo|NO|59.91|10.75
Bergen|NO|60.39|5.32
Trondheim|NO|63.43|10.40
Tromsø|NO|69.65|18.96
Lofoten (Svolvær)|NO|68.23|14.57
Longyearbyen (Svalbard)|NO|78.22|15.65
Stockholm|SE|59.33|18.07
Gothenburg|SE|57.71|11.97
Kiruna|SE|67.86|20.23
Abisko|SE|68.35|18.83
Helsinki|FI|60.17|24.94
Rovaniemi|FI|66.50|25.73
Reykjavík|IS|64.15|-21.94
Akureyri|IS|65.68|-18.09
Vík|IS|63.42|-19.01
Tallinn|EE|59.44|24.75
Riga|LV|56.95|24.11
Vilnius|LT|54.69|25.28
Kyiv|UA|50.45|30.52
Lviv|UA|49.84|24.03
Odesa|UA|46.48|30.72
Minsk|BY|53.90|27.56
Chișinău|MD|47.01|28.86
Moscow|RU|55.76|37.62
Saint Petersburg|RU|59.94|30.31
Murmansk|RU|68.97|33.08
Kazan|RU|55.79|49.12
Yekaterinburg|RU|56.84|60.61
Novosibirsk|RU|55.03|82.92
Irkutsk|RU|52.29|104.28
Yakutsk|RU|62.03|129.73
Vladivostok|RU|43.12|131.89
Petropavlovsk-Kamchatsky|RU|53.02|158.65
Tbilisi|GE|41.72|44.79
Yerevan|AM|40.18|44.51
Baku|AZ|40.41|49.87
Almaty|KZ|43.24|76.89
Astana|KZ|51.17|71.43
Tashkent|UZ|41.30|69.24
Samarkand|UZ|39.65|66.96
Bishkek|KG|42.87|74.59
Dushanbe|TJ|38.56|68.79
Ashgabat|TM|37.95|58.38
Ulaanbaatar|MN|47.89|106.91
Kabul|AF|34.56|69.21
Tehran|IR|35.69|51.39
Isfahan|IR|32.65|51.67
Shiraz|IR|29.59|52.58
Baghdad|IQ|33.31|44.36
Erbil|IQ|36.19|44.01
Damascus|SY|33.51|36.29
Beirut|LB|33.89|35.50
Amman|JO|31.95|35.93
Wadi Rum|JO|29.58|35.42
Jerusalem|IL|31.77|35.21
Tel Aviv|IL|32.09|34.78
Mitzpe Ramon|IL|30.61|34.80
Riyadh|SA|24.71|46.68
Jeddah|SA|21.49|39.19
AlUla|SA|26.62|37.92
Dubai|AE|25.20|55.27
Abu Dhabi|AE|24.45|54.38
Doha|QA|25.29|51.53
Manama|BH|26.23|50.59
Kuwait City|KW|29.38|47.99
Muscat|OM|23.59|58.41
Salalah|OM|17.02|54.09
Sana'a|YE|15.37|44.19
Cairo|EG|30.04|31.24
Alexandria|EG|31.20|29.92
Luxor|EG|25.69|32.64
Aswan|EG|24.09|32.90
Siwa|EG|29.20|25.52
Khartoum|SD|15.50|32.56
Addis Ababa|ET|9.03|38.74
Asmara|ER|15.32|38.93
Djibouti|DJ|11.59|43.15
Mogadishu|SO|2.05|45.32
Nairobi|KE|-1.29|36.82
Mombasa|KE|-4.04|39.67
Kampala|UG|0.35|32.58
Kigali|RW|-1.95|30.06
Dar es Salaam|TZ|-6.79|39.21
Arusha|TZ|-3.39|36.68
Zanzibar|TZ|-6.17|39.20
Lusaka|ZM|-15.39|28.32
Harare|ZW|-17.83|31.05
Victoria Falls|ZW|-17.93|25.84
Lilongwe|MW|-13.96|33.79
Maputo|MZ|-25.97|32.57
Antananarivo|MG|-18.88|47.51
Gaborone|BW|-24.63|25.92
Maun|BW|-19.98|23.42
Windhoek|NA|-22.56|17.08
Sossusvlei|NA|-24.73|15.29
Swakopmund|NA|-22.68|14.53
Johannesburg|ZA|-26.20|28.05
Pretoria|ZA|-25.75|28.19
Cape Town|ZA|-33.92|18.42
Durban|ZA|-29.86|31.03
Port Elizabeth|ZA|-33.96|25.60
Sutherland|ZA|-32.40|20.66
Bloemfontein|ZA|-29.09|26.16
Upington|ZA|-28.45|21.26
Kinshasa|CD|-4.44|15.27
Lubumbashi|CD|-11.66|27.48
Luanda|AO|-8.84|13.23
Brazzaville|CG|-4.27|15.28
Libreville|GA|0.42|9.47
Yaoundé|CM|3.85|11.50
Douala|CM|4.05|9.70
Lagos|NG|6.52|3.38
Abuja|NG|9.08|7.40
Kano|NG|12.00|8.52
Accra|GH|5.60|-0.19
Abidjan|CI|5.36|-4.01
Dakar|SN|14.72|-17.47
Bamako|ML|12.64|-8.00
Timbuktu|ML|16.77|-3.01
Niamey|NE|13.51|2.11
Agadez|NE|16.97|7.99
N'Djamena|TD|12.13|15.06
Ouagadougou|BF|12.37|-1.52
Nouakchott|MR|18.07|-15.96
Freetown|SL|8.48|-13.23
Monrovia|LR|6.30|-10.80
Conakry|GN|9.64|-13.58
Rabat|MA|34.02|-6.84
Casablanca|MA|33.57|-7.59
Marrakesh|MA|31.63|-7.99
Merzouga|MA|31.10|-4.01
Algiers|DZ|36.75|3.06
Tamanrasset|DZ|22.79|5.53
Tunis|TN|36.81|10.18
Tripoli|LY|32.89|13.19
Benghazi|LY|32.12|20.09
Karachi|PK|24.86|67.01
Lahore|PK|31.55|74.34
Islamabad|PK|33.68|73.05
Quetta|PK|30.18|66.99
Delhi|IN|28.61|77.21
Mumbai|IN|19.08|72.88
Bengaluru|IN|12.97|77.59
Chennai|IN|13.08|80.27
Kolkata|IN|22.57|88.36
Hyderabad|IN|17.39|78.49
Ahmedabad|IN|23.02|72.57
Pune|IN|18.52|73.86
Jaipur|IN|26.91|75.79
Jaisalmer|IN|26.92|70.91
Leh (Ladakh)|IN|34.15|77.58
Hanle|IN|32.78|78.96
Varanasi|IN|25.32|82.97
Goa (Panaji)|IN|15.49|73.83
Kochi|IN|9.93|76.27
Guwahati|IN|26.14|91.74
Kathmandu|NP|27.72|85.32
Pokhara|NP|28.21|83.99
Thimphu|BT|27.47|89.64
Dhaka|BD|23.81|90.41
Colombo|LK|6.93|79.86
Malé|MV|4.18|73.51
Yangon|MM|16.87|96.20
Mandalay|MM|21.96|96.08
Bangkok|TH|13.76|100.50
Chiang Mai|TH|18.79|98.99
Phuket|TH|7.88|98.39
Vientiane|LA|17.98|102.63
Phnom Penh|KH|11.56|104.92
Siem Reap|KH|13.36|103.86
Hanoi|VN|21.03|105.85
Ho Chi Minh City|VN|10.82|106.63
Da Nang|VN|16.05|108.20
Kuala Lumpur|MY|3.14|101.69
Kota Kinabalu|MY|5.98|116.07
Kuching|MY|1.55|110.36
Singapore|SG|1.35|103.82
Jakarta|ID|-6.21|106.85
Surabaya|ID|-7.25|112.75
Denpasar (Bali)|ID|-8.65|115.22
Makassar|ID|-5.15|119.43
Medan|ID|3.59|98.67
Jayapura|ID|-2.53|140.72
Manila|PH|14.60|120.98
Cebu|PH|10.32|123.89
Davao|PH|7.19|125.46
Beijing|CN|39.90|116.41
Shanghai|CN|31.23|121.47
Guangzhou|CN|23.13|113.26
Shenzhen|CN|22.54|114.06
Chengdu|CN|30.57|104.07
Chongqing|CN|29.56|106.55
Wuhan|CN|30.59|114.31
Xi'an|CN|34.34|108.94
Kunming|CN|25.04|102.71
Lhasa|CN|29.65|91.17
Ürümqi|CN|43.83|87.62
Kashgar|CN|39.47|75.99
Harbin|CN|45.80|126.53
Hohhot|CN|40.84|111.75
Lanzhou|CN|36.06|103.83
Dunhuang|CN|40.14|94.66
Golmud|CN|36.42|94.90
Hong Kong|HK|22.32|114.17
Taipei|TW|25.03|121.57
Kaohsiung|TW|22.63|120.30
Seoul|KR|37.57|126.98
Busan|KR|35.18|129.08
Jeju|KR|33.50|126.53
Pyongyang|KP|39.04|125.76
Tokyo|JP|35.68|139.69
Osaka|JP|34.69|135.50
Nagoya|JP|35.18|136.91
Sapporo|JP|43.06|141.35
Fukuoka|JP|33.59|130.40
Sendai|JP|38.27|140.87
Hiroshima|JP|34.39|132.46
Naha (Okinawa)|JP|26.21|127.68
Ishigaki|JP|24.34|124.16
Sydney|AU|-33.87|151.21
Melbourne|AU|-37.81|144.96
Brisbane|AU|-27.47|153.03
Perth|AU|-31.95|115.86
Adelaide|AU|-34.93|138.60
Canberra|AU|-35.28|149.13
Hobart|AU|-42.88|147.33
Darwin|AU|-12.46|130.84
Cairns|AU|-16.92|145.77
Townsville|AU|-19.26|146.82
Alice Springs|AU|-23.70|133.88
Uluru (Yulara)|AU|-25.24|130.99
Broome|AU|-17.96|122.24
Coober Pedy|AU|-29.01|134.75
Coonabarabran (Siding Spring)|AU|-31.27|149.28
Exmouth|AU|-21.93|114.13
Kalgoorlie|AU|-30.75|121.47
Mount Isa|AU|-20.73|139.49
Auckland|NZ|-36.85|174.76
Wellington|NZ|-41.29|174.78
Christchurch|NZ|-43.53|172.64
Queenstown|NZ|-45.03|168.66
Tekapo (Aoraki Mackenzie)|NZ|-44.00|170.48
Dunedin|NZ|-45.87|170.50
Suva|FJ|-18.14|178.44
Nouméa|NC|-22.28|166.46
Port Moresby|PG|-9.44|147.18
Port Vila|VU|-17.73|168.32
Apia|WS|-13.83|-171.76
Papeete (Tahiti)|PF|-17.54|-149.57
Rarotonga|CK|-21.21|-159.78
Easter Island (Hanga Roa)|CL|-27.15|-109.43
Galápagos (Puerto Ayora)|EC|-0.74|-90.31
Nuuk|GL|64.18|-51.72
Kangerlussuaq|GL|67.01|-50.71
McMurdo Station|AQ|-77.85|166.67`;
const PLACES = RAW.split("\n").map(l => { const [name, cc, lat, lon] = l.split("|"); return { name, cc, lat: +lat, lon: +lon }; });
const COUNTRY = { US: "USA", CA: "Canada", MX: "Mexico", GT: "Guatemala", CR: "Costa Rica", PA: "Panama", CU: "Cuba", DO: "Dominican Republic", PR: "Puerto Rico", JM: "Jamaica", CO: "Colombia", VE: "Venezuela", EC: "Ecuador", PE: "Peru", BO: "Bolivia", CL: "Chile", AR: "Argentina", UY: "Uruguay", PY: "Paraguay", BR: "Brazil", GB: "UK", IE: "Ireland", FR: "France", ES: "Spain", PT: "Portugal", IT: "Italy", DE: "Germany", NL: "Netherlands", BE: "Belgium", LU: "Luxembourg", CH: "Switzerland", AT: "Austria", CZ: "Czechia", PL: "Poland", HU: "Hungary", SK: "Slovakia", SI: "Slovenia", HR: "Croatia", RS: "Serbia", BA: "Bosnia and Herzegovina", BG: "Bulgaria", RO: "Romania", GR: "Greece", TR: "Türkiye", DK: "Denmark", NO: "Norway", SE: "Sweden", FI: "Finland", IS: "Iceland", EE: "Estonia", LV: "Latvia", LT: "Lithuania", UA: "Ukraine", BY: "Belarus", MD: "Moldova", RU: "Russia", GE: "Georgia", AM: "Armenia", AZ: "Azerbaijan", KZ: "Kazakhstan", UZ: "Uzbekistan", KG: "Kyrgyzstan", TJ: "Tajikistan", TM: "Turkmenistan", MN: "Mongolia", AF: "Afghanistan", IR: "Iran", IQ: "Iraq", SY: "Syria", LB: "Lebanon", JO: "Jordan", IL: "Israel", SA: "Saudi Arabia", AE: "UAE", QA: "Qatar", BH: "Bahrain", KW: "Kuwait", OM: "Oman", YE: "Yemen", EG: "Egypt", SD: "Sudan", ET: "Ethiopia", ER: "Eritrea", DJ: "Djibouti", SO: "Somalia", KE: "Kenya", UG: "Uganda", RW: "Rwanda", TZ: "Tanzania", ZM: "Zambia", ZW: "Zimbabwe", MW: "Malawi", MZ: "Mozambique", MG: "Madagascar", BW: "Botswana", NA: "Namibia", ZA: "South Africa", CD: "DR Congo", AO: "Angola", CG: "Congo", GA: "Gabon", CM: "Cameroon", NG: "Nigeria", GH: "Ghana", CI: "Côte d'Ivoire", SN: "Senegal", ML: "Mali", NE: "Niger", TD: "Chad", BF: "Burkina Faso", MR: "Mauritania", SL: "Sierra Leone", LR: "Liberia", GN: "Guinea", MA: "Morocco", DZ: "Algeria", TN: "Tunisia", LY: "Libya", PK: "Pakistan", IN: "India", NP: "Nepal", BT: "Bhutan", BD: "Bangladesh", LK: "Sri Lanka", MV: "Maldives", MM: "Myanmar", TH: "Thailand", LA: "Laos", KH: "Cambodia", VN: "Vietnam", MY: "Malaysia", SG: "Singapore", ID: "Indonesia", PH: "Philippines", CN: "China", HK: "Hong Kong", TW: "Taiwan", KR: "South Korea", KP: "North Korea", JP: "Japan", AU: "Australia", NZ: "New Zealand", FJ: "Fiji", NC: "New Caledonia", PG: "Papua New Guinea", VU: "Vanuatu", WS: "Samoa", PF: "French Polynesia", CK: "Cook Islands", GL: "Greenland", AQ: "Antarctica" };
const D2R = Math.PI / 180;
function distBearing(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const d = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return { d, brg: (Math.atan2(y, x) / D2R + 360) % 360 };
}
const DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
// nearest reference places to a point; bearing is FROM the place TO the point
function nearest(lat, lon, n = 3) {
  return PLACES.map(p => { const r = distBearing(p.lat, p.lon, lat, lon); return { ...p, country: COUNTRY[p.cc] || p.cc, km: r.d, dir: DIRS[Math.round(r.brg / 22.5) % 16] }; }).sort((a, b) => a.km - b.km).slice(0, n);
}
const api = { PLACES, nearest };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.StarfixPlaces = api;
})(typeof window !== "undefined" ? window : globalThis);
