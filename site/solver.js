/* Starfix solver: celestial navigation from a photo.
   Pure functions; runs in the browser (window.Starfix) and in node (module.exports). */
(function (root) {
"use strict";
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const LEAN = 0.3 * D2R; // real "vertical" edges lean by a few tenths of a degree

// ---------- catalog (J2000, V mag; pm in mas/yr, pmRA includes cos dec) ----------
// [name, constellation, "RA h m s", "Dec d m s", mag, pmRA, pmDec]
const RAW = [
["Sirius","CMa","06 45 08.92","-16 42 58.0",-1.46,-546,-1223],
["Canopus","Car","06 23 57.11","-52 41 44.4",-0.74,20,24],
["Rigil Kentaurus","Cen","14 39 36.49","-60 50 02.3",-0.27,-3608,686],
["Arcturus","Boo","14 15 39.67","+19 10 56.7",-0.05,-1093,-1999],
["Vega","Lyr","18 36 56.34","+38 47 01.3",0.03,201,287],
["Capella","Aur","05 16 41.36","+45 59 52.8",0.08,75,-427],
["Rigel","Ori","05 14 32.27","-08 12 05.9",0.13,1,0],
["Procyon","CMi","07 39 18.12","+05 13 30.0",0.34,-716,-1035],
["Achernar","Eri","01 37 42.85","-57 14 12.3",0.46,88,-40],
["Betelgeuse","Ori","05 55 10.31","+07 24 25.4",0.50,27,11],
["Hadar","Cen","14 03 49.41","-60 22 22.9",0.61,-33,-25],
["Altair","Aql","19 50 47.00","+08 52 06.0",0.76,537,386],
["Acrux","Cru","12 26 35.90","-63 05 56.7",0.76,-36,-15],
["Aldebaran","Tau","04 35 55.24","+16 30 33.5",0.86,63,-189],
["Antares","Sco","16 29 24.46","-26 25 55.2",0.96,-12,-23],
["Spica","Vir","13 25 11.58","-11 09 40.8",0.97,-43,-32],
["Pollux","Gem","07 45 18.95","+28 01 34.3",1.14,-626,-46],
["Fomalhaut","PsA","22 57 39.05","-29 37 20.1",1.16,329,-165],
["Deneb","Cyg","20 41 25.92","+45 16 49.2",1.25,2,2],
["Mimosa","Cru","12 47 43.27","-59 41 19.6",1.25,-48,-13],
["Regulus","Leo","10 08 22.31","+11 58 02.0",1.40,-249,5],
["Adhara","CMa","06 58 37.55","-28 58 19.5",1.50,3,2],
["Castor","Gem","07 34 35.86","+31 53 17.8",1.58,-191,-145],
["Gacrux","Cru","12 31 09.96","-57 06 47.6",1.63,28,-264],
["Shaula","Sco","17 33 36.52","-37 06 13.8",1.62,-9,-30],
["Bellatrix","Ori","05 25 07.86","+06 20 58.9",1.64,-9,-13],
["Elnath","Tau","05 26 17.51","+28 36 26.8",1.65,23,-174],
["Miaplacidus","Car","09 13 11.98","-69 43 01.9",1.68,-157,108],
["Alnilam","Ori","05 36 12.81","-01 12 06.9",1.69,1,-1],
["Alnair","Gru","22 08 13.98","-46 57 39.5",1.74,127,-147],
["Alnitak","Ori","05 40 45.53","-01 56 33.3",1.77,4,3],
["Alioth","UMa","12 54 01.75","+55 57 35.4",1.77,112,-9],
["Dubhe","UMa","11 03 43.67","+61 45 03.7",1.79,-134,-35],
["Mirfak","Per","03 24 19.37","+49 51 40.2",1.79,24,-26],
["Wezen","CMa","07 08 23.48","-26 23 35.5",1.83,-3,3],
["Regor","Vel","08 09 31.95","-47 20 11.7",1.83,-6,10],
["Kaus Australis","Sgr","18 24 10.32","-34 23 04.6",1.85,-40,-125],
["Avior","Car","08 22 30.84","-59 30 34.1",1.86,-25,23],
["Alkaid","UMa","13 47 32.44","+49 18 47.8",1.86,-121,-15],
["Sargas","Sco","17 37 19.13","-42 59 52.2",1.87,6,-1],
["Menkalinan","Aur","05 59 31.72","+44 56 50.8",1.90,-57,-1],
["Atria","TrA","16 48 39.90","-69 01 39.8",1.91,18,-32],
["Alhena","Gem","06 37 42.71","+16 23 57.4",1.92,-2,-67],
["Peacock","Pav","20 25 38.86","-56 44 06.3",1.94,7,-86],
["Alsephina","Vel","08 44 42.23","-54 42 30.0",1.96,29,-104],
["Mirzam","CMa","06 22 41.99","-17 57 21.3",1.98,-3,-1],
["Alphard","Hya","09 27 35.24","-08 39 31.0",1.98,-15,34],
["Polaris","UMi","02 31 49.09","+89 15 50.8",1.98,44,-12],
["Hamal","Ari","02 07 10.41","+23 27 44.7",2.00,188,-148],
["Algieba","Leo","10 19 58.35","+19 50 29.4",2.08,310,-153],
["Diphda","Cet","00 43 35.37","-17 59 11.8",2.04,233,33],
["Nunki","Sgr","18 55 15.93","-26 17 48.2",2.05,14,-53],
["Menkent","Cen","14 06 40.95","-36 22 11.8",2.06,-520,-518],
["Mirach","And","01 09 43.92","+35 37 14.0",2.07,176,-112],
["Alpheratz","And","00 08 23.26","+29 05 25.6",2.06,138,-163],
["Rasalhague","Oph","17 34 56.07","+12 33 36.1",2.07,108,-222],
["Kochab","UMi","14 50 42.33","+74 09 19.8",2.08,-32,12],
["Saiph","Ori","05 47 45.39","-09 40 10.6",2.09,2,-1],
["Denebola","Leo","11 49 03.58","+14 34 19.4",2.13,-497,-114],
["Algol","Per","03 08 10.13","+40 57 20.3",2.12,3,-2],
["Tiaki","Gru","22 42 40.05","-46 53 04.5",2.07,136,-5],
["Muhlifain","Cen","12 41 31.04","-48 57 35.5",2.20,-187,-1],
["Aspidiske","Car","09 17 05.41","-59 16 30.8",2.21,-19,13],
["Suhail","Vel","09 07 59.76","-43 25 57.3",2.21,-24,14],
["Alphecca","CrB","15 34 41.27","+26 42 52.9",2.23,121,-89],
["Mizar","UMa","13 23 55.54","+54 55 31.3",2.23,120,-22],
["Sadr","Cyg","20 22 13.70","+40 15 24.0",2.23,2,0],
["Schedar","Cas","00 40 30.44","+56 32 14.4",2.24,50,-32],
["Eltanin","Dra","17 56 36.37","+51 29 20.0",2.24,-8,-23],
["Mintaka","Ori","05 32 00.40","-00 17 56.7",2.25,0,-1],
["Caph","Cas","00 09 10.69","+59 08 59.2",2.28,523,-180],
["Almach","And","02 03 53.95","+42 19 47.0",2.26,43,-51],
["Dschubba","Sco","16 00 20.01","-22 37 18.1",2.29,-9,-37],
["Larawag","Sco","16 50 09.81","-34 17 35.6",2.29,-611,-256],
["Epsilon Centauri","Cen","13 39 53.26","-53 27 59.0",2.30,-15,-13],
["Alpha Lupi","Lup","14 41 55.76","-47 23 17.5",2.30,-21,-24],
["Eta Centauri","Cen","14 35 30.42","-42 09 28.2",2.33,-35,-33],
["Merak","UMa","11 01 50.48","+56 22 56.7",2.34,81,34],
["Izar","Boo","14 44 59.22","+27 04 27.2",2.37,-51,21],
["Enif","Peg","21 44 11.16","+09 52 30.0",2.38,27,0],
["Girtab","Sco","17 42 29.28","-39 01 47.9",2.39,-6,-26],
["Ankaa","Phe","00 26 17.05","-42 18 21.6",2.40,233,-356],
["Phecda","UMa","11 53 49.85","+53 41 41.1",2.44,108,11],
["Sabik","Oph","17 10 22.69","-15 43 29.7",2.43,41,98],
["Scheat","Peg","23 03 46.46","+28 04 58.0",2.42,187,137],
["Alderamin","Cep","21 18 34.77","+62 35 08.1",2.45,150,49],
["Aludra","CMa","07 24 05.70","-29 18 11.2",2.45,-4,7],
["Markeb","Vel","09 22 06.82","-55 00 38.4",2.47,-11,11],
["Navi","Cas","00 56 42.53","+60 43 00.3",2.47,25,-4],
["Aljanah","Cyg","20 46 12.68","+33 58 12.9",2.48,356,330],
["Markab","Peg","23 04 45.65","+15 12 19.0",2.48,61,-42],
["Naos","Pup","08 03 35.05","-40 00 11.3",2.25,-30,17],
["Menkar","Cet","03 02 16.77","+04 05 23.1",2.54,-10,-76],
["Zosma","Leo","11 14 06.50","+20 31 25.4",2.56,143,-130],
["Acrab","Sco","16 05 26.23","-19 48 19.6",2.62,-5,-25],
["Arneb","Lep","05 32 43.82","-17 49 20.2",2.58,3,2],
["Gienah","Crv","12 15 48.37","-17 32 30.9",2.59,-159,22],
["Zubeneschamali","Lib","15 17 00.41","-09 22 58.5",2.61,-96,-20],
["Unukalhai","Ser","15 44 16.07","+06 25 32.3",2.63,134,44],
["Sheratan","Ari","01 54 38.41","+20 48 28.9",2.64,98,-110],
["Kraz","Crv","12 34 23.23","-23 23 48.3",2.65,1,-56],
["Phact","Col","05 39 38.94","-34 04 26.8",2.65,1,-24],
["Ruchbah","Cas","01 25 48.95","+60 14 07.0",2.68,297,-50],
["Muphrid","Boo","13 54 41.08","+18 23 51.8",2.68,-61,-358],
["Lesath","Sco","17 30 45.84","-37 17 44.9",2.70,-4,-29],
["Tarazed","Aql","19 46 15.58","+10 36 47.7",2.72,16,-3],
["Zubenelgenubi","Lib","14 50 52.71","-16 02 30.4",2.75,-106,-69],
["Kaus Media","Sgr","18 20 59.64","-29 49 41.2",2.70,30,-26],
["Kaus Borealis","Sgr","18 27 58.24","-25 25 18.1",2.81,-45,-186],
["Ascella","Sgr","19 02 36.72","-29 52 48.4",2.60,14,-4],
["Alnasl","Sgr","18 05 48.49","-30 25 26.7",2.98,-55,-182],
["Albireo","Cyg","19 30 43.28","+27 57 34.8",3.05,-7,-6],
["Algenib","Peg","00 13 14.15","+15 11 00.9",2.83,4,-12],
["Segin","Cas","01 54 23.73","+63 40 12.4",3.37,32,-18],
["Megrez","UMa","12 15 25.56","+57 01 57.4",3.31,104,7],
["Alcor","UMa","13 25 13.54","+54 59 16.7",3.99,120,-16],
["Pherkad","UMi","15 20 43.72","+71 50 02.5",3.00,-18,18],
["Thuban","Dra","14 04 23.35","+64 22 33.1",3.65,-56,17],
["Rastaban","Dra","17 30 25.96","+52 18 05.0",2.79,-16,12],
["Athebyne","Dra","16 23 59.49","+61 30 51.2",2.73,-17,57],
["Altais","Dra","19 12 33.30","+67 39 41.5",3.07,95,92],
["Aldhibah","Dra","17 08 47.20","+65 42 52.9",3.17,-21,19],
["Edasich","Dra","15 24 55.77","+58 57 57.8",3.29,-9,17],
["Sheliak","Lyr","18 50 04.80","+33 21 45.6",3.52,2,-4],
["Sulafat","Lyr","18 58 56.62","+32 41 22.4",3.25,-3,1],
["Alshain","Aql","19 55 18.79","+06 24 24.3",3.71,47,-482],
["Okab","Aql","19 05 24.61","+13 51 48.5",2.99,-7,-96],
["Theta Aquilae","Aql","20 11 18.29","-00 49 17.3",3.24,36,6],
["Delta Aquilae","Aql","19 25 29.90","+03 06 53.2",3.36,254,80],
["Vindemiatrix","Vir","13 02 10.60","+10 57 32.9",2.83,-275,20],
["Porrima","Vir","12 41 39.64","-01 26 57.7",2.74,-617,61],
["Minelauva","Vir","12 55 36.21","+03 23 50.9",3.38,-472,-53],
["Heze","Vir","13 34 41.59","-00 35 44.9",3.37,-279,49],
["Algorab","Crv","12 29 51.86","-16 30 55.6",2.95,-210,-139],
["Minkar","Crv","12 10 07.48","-22 37 11.2",3.00,-72,11],
["Cor Caroli","CVn","12 56 01.67","+38 19 06.2",2.89,-236,54],
["Seginus","Boo","14 32 04.67","+38 18 29.7",3.03,-116,152],
["Kornephoros","Her","16 30 13.20","+21 29 22.6",2.77,-98,-14],
["Rasalgethi","Her","17 14 38.86","+14 23 25.2",3.10,-7,32],
["Zeta Herculis","Her","16 41 17.16","+31 36 09.8",2.81,-462,345],
["Pi Herculis","Her","17 15 02.83","+36 48 33.0",3.16,-27,3],
["Eta Herculis","Her","16 42 53.77","+38 55 20.1",3.48,36,-85],
["Cebalrai","Oph","17 43 28.35","+04 34 02.3",2.77,-41,159],
["Yed Prior","Oph","16 14 20.74","-03 41 39.6",2.73,-46,-143],
["Yed Posterior","Oph","16 18 19.29","-04 41 33.0",3.24,82,41],
["Zeta Ophiuchi","Oph","16 37 09.54","-10 34 01.5",2.56,15,25],
["Kappa Ophiuchi","Oph","16 57 40.10","+09 22 30.1",3.20,-293,-10],
["Eta Serpentis","Ser","18 21 18.60","-02 53 55.8",3.23,-549,-699],
["Mothallah","Tri","01 53 04.91","+29 34 43.8",3.41,11,-234],
["Beta Trianguli","Tri","02 09 32.63","+34 59 14.3",3.00,149,-39],
["Zeta Persei","Per","03 54 07.92","+31 53 01.1",2.85,6,-10],
["Epsilon Persei","Per","03 57 51.23","+40 00 36.8",2.89,13,-24],
["Delta Persei","Per","03 42 55.50","+47 47 15.2",3.01,26,-43],
["Alcyone","Tau","03 47 29.08","+24 06 18.5",2.87,19,-44],
["Tianguan","Tau","05 37 38.69","+21 08 33.2",3.00,2,-18],
["Ain","Tau","04 28 36.99","+19 10 49.6",3.53,107,-37],
["Prima Hyadum","Tau","04 19 47.60","+15 37 39.5",3.65,116,-23],
["Hassaleh","Aur","04 56 59.62","+33 09 57.9",2.69,4,-18],
["Mahasim","Aur","05 59 43.27","+37 12 45.3",2.62,42,-74],
["Almaaz","Aur","05 01 58.13","+43 49 23.9",2.99,0,-2],
["Haedus","Aur","05 06 30.89","+41 14 04.1",3.17,31,-68],
["Mebsuta","Gem","06 43 55.93","+25 07 52.0",2.98,-6,-11],
["Tejat","Gem","06 22 57.63","+22 30 48.9",2.88,57,-110],
["Wasat","Gem","07 20 07.38","+21 58 56.4",3.53,-18,-8],
["Gomeisa","CMi","07 27 09.04","+08 17 21.5",2.90,-50,-38],
["Furud","CMa","06 20 18.79","-30 03 48.1",3.02,-4,1],
["Pi Puppis","Pup","07 17 08.56","-37 05 51.0",2.70,-10,7],
["Tureis","Pup","08 07 32.65","-24 18 15.6",2.83,-83,46],
["Mu Velorum","Vel","10 46 46.18","-49 25 12.9",2.69,63,-54],
["Theta Carinae","Car","10 42 57.40","-64 23 40.0",2.76,-18,12],
["Upsilon Carinae","Car","09 47 06.12","-65 04 19.2",2.97,-11,7],
["Omega Carinae","Car","10 13 44.22","-70 02 16.5",3.29,-36,5],
["Imai","Cru","12 15 08.72","-58 44 56.1",2.79,-36,-11],
["Alpha Muscae","Mus","12 37 11.02","-69 08 08.0",2.69,-40,-12],
["Delta Centauri","Cen","12 08 21.50","-50 43 20.7",2.52,-48,-10],
["Zeta Centauri","Cen","13 55 32.38","-47 17 18.1",2.55,-58,-45],
["Beta Lupi","Lup","14 58 31.93","-43 08 02.3",2.68,-34,-38],
["Gamma Lupi","Lup","15 35 08.45","-41 10 00.3",2.78,-16,-26],
["Beta Trianguli Australis","TrA","15 55 08.56","-63 25 50.6",2.85,-189,-402],
["Gamma Trianguli Australis","TrA","15 18 54.58","-68 40 46.4",2.89,-66,-32],
["Alpha Arae","Ara","17 31 50.49","-49 52 34.1",2.95,-32,-67],
["Beta Arae","Ara","17 25 17.99","-55 31 47.6",2.85,-8,-25],
["Paikauhale","Sco","16 35 52.95","-28 12 57.7",2.82,-10,-23],
["Alniyat","Sco","16 21 11.32","-25 35 34.1",2.89,-10,-16],
["Fang","Sco","15 58 51.11","-26 06 50.8",2.89,-11,-26],
["Xamidimura","Sco","16 51 52.23","-38 02 50.6",3.00,-11,-24],
["Iota Scorpii","Sco","17 47 35.08","-40 07 37.2",2.99,0,-6],
["Eta Scorpii","Sco","17 12 09.20","-43 14 21.1",3.32,22,-287],
["Albaldah","Sgr","19 09 45.83","-21 01 25.0",2.89,-1,-36],
["Phi Sagittarii","Sgr","18 45 39.39","-26 59 26.8",3.17,51,1],
["Tau Sagittarii","Sgr","19 06 56.41","-27 40 13.5",3.32,-51,-250],
["Deneb Algedi","Cap","21 47 02.44","-16 07 38.2",2.85,262,-297],
["Dabih","Cap","20 21 00.68","-14 46 52.9",3.08,44,5],
["Sadalsuud","Aqr","21 31 33.53","-05 34 16.2",2.87,19,-9],
["Sadalmelik","Aqr","22 05 47.04","-00 19 11.5",2.95,18,-10],
["Skat","Aqr","22 54 39.01","-15 49 14.9",3.27,-43,-27],
["Gamma Gruis","Gru","21 53 55.73","-37 21 53.5",3.00,97,-11],
["Alpha Tucanae","Tuc","22 18 30.09","-60 15 34.5",2.86,-71,-38],
["Beta Hydri","Hyi","00 25 45.07","-77 15 15.3",2.80,2220,324],
["Alpha Hydri","Hyi","01 58 46.19","-61 34 11.5",2.86,263,27],
["Acamar","Eri","02 58 15.68","-40 18 17.0",2.88,-53,22],
["Zaurak","Eri","03 58 01.77","-13 30 30.7",2.95,61,-111],
["Cursa","Eri","05 07 50.99","-05 05 11.2",2.79,-83,-75],
["Nihal","Lep","05 28 14.72","-20 45 34.0",2.84,-5,-86],
["Wazn","Col","05 50 57.59","-35 46 05.9",3.12,57,404],
["Gamma Hydrae","Hya","13 18 55.30","-23 10 17.4",3.00,69,-42],
["Chertan","Leo","11 14 14.40","+15 25 46.5",3.33,-60,-79],
["Rasalas","Leo","09 52 45.82","+26 00 25.0",3.88,-217,-56],
["Algenubi","Leo","09 45 51.07","+23 46 27.3",2.98,-46,-10],
["Eta Leonis","Leo","10 07 19.95","+16 45 45.6",3.48,-2,-1],
["Adhafera","Leo","10 16 41.42","+23 25 02.3",3.44,20,-7],
["Tania Australis","UMa","10 22 19.74","+41 29 58.3",3.06,-81,35],
["Talitha","UMa","08 59 12.45","+48 02 30.6",3.14,-441,-215],
["Muscida","UMa","08 30 15.87","+60 43 05.4",3.36,-134,-108],
["Psi Ursae Majoris","UMa","11 09 39.81","+44 29 54.6",3.01,-62,-28],
["Theta Ursae Majoris","UMa","09 32 51.43","+51 40 38.3",3.17,-947,-536],
["Alula Borealis","UMa","11 18 28.74","+33 05 39.5",3.48,-27,28],
["Fawaris","Cyg","19 44 58.48","+45 07 50.9",2.87,44,49],
["Zeta Cygni","Cyg","21 12 56.19","+30 13 37.5",3.21,7,-67],
["Homam","Peg","22 41 27.72","+10 49 53.2",3.40,78,-12],
["Matar","Peg","22 43 00.14","+30 13 17.0",2.94,13,-26],
["Delta Andromedae","And","00 39 19.68","+30 51 39.7",3.27,114,-84],
["Alfirk","Cep","21 28 39.60","+70 33 38.6",3.23,12,8],
["Errai","Cep","23 39 20.85","+77 37 56.2",3.21,-65,165],
["Meissa","Ori","05 35 08.28","+09 56 03.0",3.39,-1,-2],
["Hatysa","Ori","05 35 25.98","-05 54 35.6",2.77,2,-1],
["Tabit","Ori","04 49 50.41","+06 57 40.6",3.19,464,11],
["Sualocin","Del","20 39 38.29","+15 54 43.5",3.77,54,9],
["Rotanev","Del","20 37 32.94","+14 35 42.3",3.63,119,-47],
["Deneb Kaitos Shemali","Cet","00 19 25.67","-08 49 26.1",3.56,-14,-37]
];

function parseHMS(s) { const p = s.trim().split(/\s+/).map(Number); return (p[0] + p[1] / 60 + p[2] / 3600) * 15; }
function parseDMS(s) { const neg = s.trim()[0] === "-"; const p = s.replace(/^[+-]/, "").trim().split(/\s+/).map(Number); const v = p[0] + p[1] / 60 + p[2] / 3600; return neg ? -v : v; }
const CATALOG = RAW.map(r => ({ name: r[0], con: r[1], ra: parseHMS(r[2]), dec: parseDMS(r[3]), mag: r[4], pmRA: r[5] || 0, pmDec: r[6] || 0 }));
const BY_NAME = new Map(CATALOG.map(s => [s.name.toLowerCase(), s]));

// ---------- vectors ----------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const mulMV = (M, v) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
const mulMtV = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
const mulMM = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const radec2vec = (ra, dec) => { const a = ra * D2R, d = dec * D2R; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };
const vec2radec = v => { let ra = Math.atan2(v[1], v[0]) * R2D; if (ra < 0) ra += 360; return { ra, dec: Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D }; };
const angle = (a, b) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

// ---------- time & earth orientation ----------
function jdFromDate(d) { return d.getTime() / 86400000 + 2440587.5; }
function gmstDeg(jd) {
  const T = (jd - 2451545) / 36525;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - T * T * T / 38710000;
  return ((g % 360) + 360) % 360;
}
function precessionMatrix(jd) { // J2000 mean -> mean of date (IAU 1976)
  const T = (jd - 2451545) / 36525, as = D2R / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * as;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * as;
  const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * as;
  const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(th), st = Math.sin(th);
  return [
    [cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ],
    [cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ],
    [cz * st, -sz * st, ct]
  ];
}
function aberrationVector(jd) { // Earth velocity / c in equatorial J2000-ish frame
  const n = jd - 2451545, L = (280.460 + 0.9856474 * n) * D2R, g = (357.528 + 0.9856003 * n) * D2R;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const eps = 23.439 * D2R, k = 20.49552 / 3600 * D2R;
  const apex = lam - Math.PI / 2; // direction of Earth's motion in ecliptic longitude
  const ex = Math.cos(apex), ey = Math.sin(apex);
  return [k * ex, k * ey * Math.cos(eps), k * ey * Math.sin(eps)];
}
// apparent (geocentric, before refraction) unit vectors in the true-of-date frame
function catalogOfDate(jd, planets) {
  const P = precessionMatrix(jd), ab = aberrationVector(jd), yrs = (jd - 2451545) / 365.25;
  const out = new Map();
  for (const s of CATALOG) {
    const dec = s.dec + s.pmDec * yrs / 3.6e6, ra = s.ra + s.pmRA * yrs / 3.6e6 / Math.cos(s.dec * D2R);
    const v = norm(add(radec2vec(ra, dec), ab));
    out.set(s.name.toLowerCase(), { name: s.name, mag: s.mag, con: s.con, v: norm(mulMV(P, v)) });
  }
  for (const p of planets || []) out.set(p.name.toLowerCase(), { name: p.name, mag: p.mag, con: p.con || "", v: norm(mulMV(P, p.vJ2000)), planet: true });
  return out;
}
// refraction (Saemundsson, standard atmosphere): apparent - true, in degrees, given true altitude
function refractionDeg(hTrue) { const h = Math.max(-1.5, hTrue); return 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60; }
function refractToward(v, zen) {
  const alt = Math.asin(Math.max(-1, Math.min(1, dot(v, zen)))) * R2D;
  if (alt < -2) return v;
  const R = refractionDeg(alt) * D2R;
  const t = norm(add(zen, scale(v, -dot(zen, v))));
  return norm(add(scale(v, Math.cos(R)), scale(t, Math.sin(R))));
}

// ---------- small linear algebra ----------
function jacobiEigen(A) {
  const n = A.length, a = A.map(r => r.slice()), V = A.map((_, i) => A.map((_, j) => i === j ? 1 : 0));
  for (let sweep = 0; sweep < 80; sweep++) {
    let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  const values = a.map((r, i) => r[i]);
  const vectors = values.map((_, j) => V.map(r => r[j]));
  return { values, vectors };
}
function solveLinear(A, b) { // Gaussian elimination with partial pivoting
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
function inv2(C) { const d = C[0][0] * C[1][1] - C[0][1] * C[1][0]; if (!isFinite(d) || Math.abs(d) < 1e-300) return null; return [[C[1][1] / d, -C[0][1] / d], [-C[1][0] / d, C[0][0] / d]]; }
// rotation that maps source vectors s_i onto targets c_i (Horn's quaternion method)
function wahba(src, dst, w) {
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < src.length; i++) { const wi = w ? w[i] : 1; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[a][b] += wi * src[i][a] * dst[i][b]; }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz]
  ];
  const { values, vectors } = jacobiEigen(N);
  let bi = 0; for (let i = 1; i < 4; i++) if (values[i] > values[bi]) bi = i;
  const [q0, qx, qy, qz] = vectors[bi];
  return [
    [q0 * q0 + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - q0 * qz), 2 * (qx * qz + q0 * qy)],
    [2 * (qy * qx + q0 * qz), q0 * q0 - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - q0 * qx)],
    [2 * (qz * qx - q0 * qy), 2 * (qz * qy + q0 * qx), q0 * q0 - qx * qx - qy * qy + qz * qz]
  ];
}
function rodrigues(w) {
  const th = Math.hypot(w[0], w[1], w[2]);
  if (th < 1e-15) return [[1, -w[2], w[1]], [w[2], 1, -w[0]], [-w[1], w[0], 1]];
  const k = scale(w, 1 / th), c = Math.cos(th), s = Math.sin(th), v = 1 - c;
  return [
    [c + k[0] * k[0] * v, k[0] * k[1] * v - k[2] * s, k[0] * k[2] * v + k[1] * s],
    [k[1] * k[0] * v + k[2] * s, c + k[1] * k[1] * v, k[1] * k[2] * v - k[0] * s],
    [k[2] * k[0] * v - k[1] * s, k[2] * k[1] * v + k[0] * s, c + k[2] * k[2] * v]
  ];
}

// ---------- camera model: pinhole + radial k1, principal point at centre ----------
function project(cam, v) {
  const c = mulMV(cam.R, v); if (c[2] <= 1e-6) return null;
  const x = c[0] / c[2], y = c[1] / c[2], d = 1 + cam.k1 * (x * x + y * y);
  return [cam.cx + cam.f * x * d, cam.cy + cam.f * y * d];
}
function camRay(cam, u, v) {
  const xd = (u - cam.cx) / cam.f, yd = (v - cam.cy) / cam.f;
  let x = xd, y = yd;
  for (let i = 0; i < 8; i++) { const d = 1 + cam.k1 * (x * x + y * y); x = xd / d; y = yd / d; }
  return norm([x, y, 1]);
}
const unproject = (cam, u, v) => mulMtV(cam.R, camRay(cam, u, v));

function fitCamera(pairs, W, H, opts = {}) {
  // pairs: [{x, y, v(eq unit)}]
  const cx = W / 2, cy = H / 2, diag = Math.hypot(W, H);
  const n = pairs.length;
  const evalF = f => {
    const cam = { cx, cy, f, k1: 0 };
    const rays = pairs.map(p => camRay(cam, p.x, p.y));
    const R = wahba(pairs.map(p => p.v), rays);
    let s = 0; for (let i = 0; i < n; i++) { const a = angle(mulMV(R, pairs[i].v), rays[i]); s += a * a; }
    return { R, f, k1: 0, cx, cy, cost: s };
  };
  let best = null;
  if (opts.init) best = { ...opts.init, cx, cy };
  else {
    const fMin = diag / (2 * Math.tan(80 * D2R)), fMax = diag / (2 * Math.tan(1.5 * D2R));
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const f = fMin * Math.pow(fMax / fMin, i / steps); const c = evalF(f);
      if (!best || c.cost < best.cost) best = c;
    }
    if (opts.f35) { const f = opts.f35 * diag / 43.27; const c = evalF(f); if (c.cost < best.cost * 1.5) best = c; }
  }
  // Levenberg-Marquardt on pixel residuals
  const useK1 = n >= 7 && opts.k1 !== false;
  const np = useK1 ? 5 : 4;
  let cam = { R: best.R, f: best.f, k1: useK1 ? (best.k1 || 0) : 0, cx, cy };
  const resid = c => { const r = []; for (const p of pairs) { const q = project(c, p.v); if (!q) { r.push(1e4, 1e4); continue; } r.push(q[0] - p.x, q[1] - p.y); } return r; };
  const apply = (c, d) => ({ R: mulMM(rodrigues([d[0], d[1], d[2]]), c.R), f: c.f * Math.exp(d[3]), k1: c.k1 + (np > 4 ? d[4] : 0), cx, cy });
  let r = resid(cam), cost = r.reduce((s, x) => s + x * x, 0), lambda = 1e-3;
  for (let it = 0; it < 60; it++) {
    const J = []; const eps = [1e-6, 1e-6, 1e-6, 1e-6, 1e-5];
    for (let k = 0; k < np; k++) { const d = new Array(np).fill(0); d[k] = eps[k]; const rk = resid(apply(cam, d)); J.push(rk.map((x, i) => (x - r[i]) / eps[k])); }
    const A = [...Array(np)].map((_, a) => [...Array(np)].map((_, b) => { let s = 0; for (let i = 0; i < r.length; i++) s += J[a][i] * J[b][i]; return s; }));
    const g = [...Array(np)].map((_, a) => { let s = 0; for (let i = 0; i < r.length; i++) s += J[a][i] * r[i]; return -s; });
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      const Ad = A.map((row, i) => row.map((x, j) => i === j ? x * (1 + lambda) + 1e-12 : x));
      const d = solveLinear(Ad, g); if (!d) { lambda *= 10; continue; }
      const c2 = apply(cam, d); const r2 = resid(c2); const cost2 = r2.reduce((s, x) => s + x * x, 0);
      if (cost2 < cost) { cam = c2; r = r2; const rel = (cost - cost2) / (cost + 1e-12); cost = cost2; lambda = Math.max(lambda / 5, 1e-9); improved = true; if (rel < 1e-10) it = 999; break; }
      lambda *= 8;
    }
    if (!improved) break;
  }
  const resPx = []; for (let i = 0; i < n; i++) resPx.push(Math.hypot(r[2 * i], r[2 * i + 1]));
  const rmsPx = Math.sqrt(resPx.reduce((s, x) => s + x * x, 0) / Math.max(1, n));
  return { ...cam, resPx, rmsPx };
}

// fit with outlier rejection; returns cam and per-pair used flags
function robustFit(pairs, W, H, opts) {
  let used = pairs.map(() => true), cam = null;
  for (let round = 0; round < 12; round++) {
    const sub = pairs.filter((_, i) => used[i]);
    if (sub.length < 3) break;
    cam = fitCamera(sub, W, H, { ...opts, init: round > 0 && cam ? cam : opts.init });
    const res = pairs.map(p => { const q = project(cam, p.v); return q ? Math.hypot(q[0] - p.x, q[1] - p.y) : 1e9; });
    const active = res.filter((_, i) => used[i]).slice().sort((a, b) => a - b);
    const med = active[Math.floor(active.length / 2)];
    const degPx = cam.f * D2R; // pixels per degree near centre
    const tol = Math.max(3 * med, 2.5, 0.08 * degPx);
    let worst = -1; for (let i = 0; i < pairs.length; i++) if (used[i] && res[i] > tol && (worst < 0 || res[i] > res[worst])) worst = i;
    // also let a previously rejected pair come back if it now fits well
    let changed = false;
    for (let i = 0; i < pairs.length; i++) if (!used[i] && res[i] < tol * 0.6 && !pairs[i].manualOff) { used[i] = true; changed = true; }
    if (worst >= 0 && sub.length > 4) { used[worst] = false; changed = true; }
    cam.res = res;
    if (!changed) break;
  }
  return { cam, used };
}

// ---------- star detection ----------
function toGray(img) {
  const { data, width: w, height: h } = img, g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  return g;
}
function boxMean(g, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1); for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1); const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]; m[y * w + x] = s / ((y1 - y0) * (x1 - x0)); } }
  return m;
}
function detectStars(g, w, h, maxN = 250, keep) {
  const bg = boxMean(g, w, h, 12);
  // matched filter: a 3x3 binomial blur raises faint stars above the noise and flattens single hot pixels
  const gs = new Float32Array(g.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gs[i] = (4 * g[i] + 2 * (g[i - 1] + g[i + 1] + g[i - w] + g[i + w]) + g[i - w - 1] + g[i - w + 1] + g[i + w - 1] + g[i + w + 1]) / 16; }
  // robust noise of the smoothed residual
  const samp = []; for (let i = w + 1; i < g.length - w - 1; i += 97) { if (keep && !keep(i % w, (i / w) | 0)) continue; samp.push(Math.abs(gs[i] - bg[i])); }
  if (!samp.length) samp.push(1);
  samp.sort((a, b) => a - b); const sigma = Math.max(0.4, 1.4826 * samp[Math.floor(samp.length / 2)]);
  const thr = Math.max(5 * sigma, 3);
  const peaks = [];
  for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) {
    const i = y * w + x, v = gs[i] - bg[i]; if (v < thr) continue;
    if (keep && !keep(x, y)) continue;
    let isMax = true;
    for (let dy = -2; dy <= 2 && isMax; dy++) for (let dx = -2; dx <= 2; dx++) { if (!dx && !dy) continue; const j = i + dy * w + dx; if (gs[j] > gs[i] || (gs[j] === gs[i] && j < i)) { isMax = false; break; } }
    if (!isMax) continue;
    let sw = 0, sx = 0, sy = 0, big = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = i + dy * w + dx; const wt = Math.max(0, gs[j] - bg[j] - 0.15 * v); sw += wt; sx += wt * dx; sy += wt * dy; if (gs[j] - bg[j] > 0.5 * v) big++; }
    if (sw <= 0) continue;
    peaks.push({ x: x + sx / sw + 0.5, y: y + sy / sw + 0.5, flux: sw, peak: v, size: big });
  }
  peaks.sort((a, b) => b.flux - a.flux);
  const out = [];
  for (const p of peaks) { if (out.some(q => Math.abs(q.x - p.x) < 4 && Math.abs(q.y - p.y) < 4)) continue; out.push(p); if (out.length >= maxN) break; }
  return { stars: out, sigma };
}
// refine a horizon tap onto the strongest vertical brightness edge nearby
function snapEdge(g, w, h, x, y, win) {
  const xi = Math.round(x); if (xi < 3 || xi > w - 4) return { x, y, snapped: false };
  const y0 = Math.max(3, Math.round(y - win)), y1 = Math.min(h - 4, Math.round(y + win));
  const prof = []; for (let yy = y0 - 2; yy <= y1 + 2; yy++) { let s = 0; for (let dx = -3; dx <= 3; dx++) s += g[yy * w + xi + dx]; prof.push(s / 7); }
  const sm = prof.map((_, i) => i < 1 || i > prof.length - 2 ? prof[i] : (prof[i - 1] + 2 * prof[i] + prof[i + 1]) / 4);
  let best = -1, bi = -1; const grads = [];
  for (let i = 2; i < sm.length - 2; i++) { const gr = Math.abs(sm[i + 1] - sm[i - 1]); grads.push(gr); if (gr > best) { best = gr; bi = i; } }
  grads.sort((a, b) => a - b); const med = grads[Math.floor(grads.length / 2)] || 0;
  if (bi < 0 || best < 4 || best < 2.5 * (med + 0.5)) return { x, y, snapped: false };
  const gm = Math.abs(sm[bi] - sm[bi - 2]), g0 = best, gp = Math.abs(sm[bi + 2] - sm[bi]);
  const den = gm - 2 * g0 + gp; const off = den !== 0 ? 0.5 * (gm - gp) / den : 0;
  return { x, y: y0 - 2 + bi + Math.max(-1, Math.min(1, off)), snapped: true };
}

// ---------- zenith from horizon points and vertical edges ----------
function solveZenith(cam, cues, starVecs) {
  // vertical edges: keep the largest set that agrees on one zenith (consensus over all pairs),
  // so a sloped roof edge or leaning tree can't drag the answer
  let vs = (cues.verticals || []).slice();
  if (vs.length >= 3 && !cues.noConsensus) {
    const all = vs, sPx = 0.7 / cam.f;
    const L = all.map(Lp => { const r1 = unproject(cam, Lp[0].x, Lp[0].y), r2 = unproject(cam, Lp[1].x, Lp[1].y), sep = angle(r1, r2); const sig = Math.hypot(Math.SQRT2 * sPx / Math.max(sep, 1e-3), LEAN); return { n: norm(cross(r1, r2)), sig, ok: sep > 0.2 * D2R }; });
    const tol = l => Math.min(1.5 * D2R, Math.max(0.6 * D2R, 3 * l.sig));
    const mean = norm(starVecs.reduce((s, v) => add(s, v), [0, 0, 0]));
    const inliersOf = z => { const a = []; L.forEach((l, k) => { if (l.ok && Math.abs(dot(z, l.n)) < tol(l)) a.push(k); }); return a; };
    // 0. if every edge already agrees with the all-edge fit, keep them all
    const z0 = solveZenithOnce(cam, cues, starVecs);
    const allOk = z0 && inliersOf(z0.z).length === L.filter(l => l.ok).length;
    if (!allOk) {
      // 1. a hypothesis from every pair of edges, scored by truncated squared residuals (MSAC):
      //    precise long edges must fit tightly, and no single bad edge can cost more than 9
      let best = null, bestCost = Infinity;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        if (!L[i].ok || !L[j].ok) continue;
        let z = cross(L[i].n, L[j].n); const zl = Math.hypot(z[0], z[1], z[2]); if (zl < Math.sin(2 * D2R)) continue;
        z = scale(z, 1 / zl); if (dot(z, mean) < 0) z = scale(z, -1);
        let c = 0; for (const l of L) { if (!l.ok) continue; const r = dot(z, l.n) / l.sig; c += Math.min(r * r, 9); }
        if (c < bestCost) { bestCost = c; best = z; }
      }
      // 2. refine: fit the zenith to the edges that agree, re-admit every edge that fits, repeat
      if (best) {
        let inl = inliersOf(best);
        for (let round = 0; round < 8 && inl.length >= 2; round++) {
          const zf = solveZenithOnce(cam, { ...cues, verticals: inl.map(k => all[k]) }, starVecs); if (!zf) break;
          const next = inliersOf(zf.z);
          if (next.length < 2 || (next.length === inl.length && next.every((k, q) => k === inl[q]))) break;
          inl = next;
        }
        if (inl.length >= 2) vs = inl.map(k => all[k]);
      }
    }
  }
  const out = solveZenithOnce(cam, { ...cues, verticals: vs }, starVecs);
  if (out) out.keptVerticals = vs;
  return out;
}
function solveZenithOnce(cam, cues, starVecs) {
  const sTap = (cues.tapSigmaPx || 1) / cam.f;
  const rows = [];
  for (const p of cues.horizon || []) rows.push({ a: unproject(cam, p.x, p.y), t: Math.sin((cues.horizonAlt || 0) * D2R), s: sTap, kind: "h" });
  (cues.verticals || []).forEach((L, idx) => {
    const r1 = unproject(cam, L[0].x, L[0].y), r2 = unproject(cam, L[1].x, L[1].y), sep = angle(r1, r2);
    if (sep < 0.2 * D2R) return;
    rows.push({ a: norm(cross(r1, r2)), t: 0, s: Math.hypot(Math.SQRT2 * sTap / sep, LEAN), kind: "v", idx });
  });
  const nh = rows.filter(r => r.kind === "h").length, nv = rows.length - nh;
  if (!(nh >= 2 || nv >= 2 || (nh >= 1 && nv >= 1))) return null;
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const r of rows) { const w = 1 / (r.s * r.s); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += w * r.a[i] * r.a[j]; }
  const { values, vectors } = jacobiEigen(M);
  let bi = 0; for (let i = 1; i < 3; i++) if (values[i] < values[bi]) bi = i;
  let z = norm(vectors[bi]);
  const mean = norm(starVecs.reduce((s, v) => add(s, v), [0, 0, 0]));
  if (dot(z, mean) < 0) z = scale(z, -1);
  const basis = zz => { let e = cross([0, 0, 1], zz); if (Math.hypot(...e) < 1e-9) e = [0, 1, 0]; e = norm(e); return { e, n: cross(zz, e) }; };
  let H = null;
  for (let it = 0; it < 10; it++) {
    const { e, n } = basis(z);
    let A = [[0, 0], [0, 0]], b = [0, 0];
    for (const r of rows) { const w = 1 / (r.s * r.s), res = dot(z, r.a) - r.t, je = dot(e, r.a), jn = dot(n, r.a); A[0][0] += w * je * je; A[0][1] += w * je * jn; A[1][1] += w * jn * jn; b[0] -= w * je * res; b[1] -= w * jn * res; }
    A[1][0] = A[0][1]; H = A;
    const d = solveLinear(A.map(r => r.slice()), b); if (!d) break;
    z = norm(add(z, add(scale(e, d[0]), scale(n, d[1]))));
    if (Math.hypot(d[0], d[1]) < 1e-12) break;
  }
  const { e, n } = basis(z);
  // empirical scatter (inflate when residuals exceed the assumed tap noise)
  let chi = 0; for (const r of rows) { const res = (dot(z, r.a) - r.t) / r.s; chi += res * res; }
  const dof = rows.length - 2, infl = dof > 0 ? Math.max(1, chi / dof) : 1;
  let C = inv2(H) || [[1, 0], [0, 1]];
  C = C.map(row => row.map(x => x * infl));
  const resid = rows.map(r => ({ kind: r.kind, idx: r.idx, deg: Math.asin(Math.max(-1, Math.min(1, dot(z, r.a) - r.t))) * R2D }));
  return { z, e, n, C, nh, nv, resid };
}


// ---------- joint sky-ground adjustment ----------
// Solves camera (rotation, focal length, k1), zenith direction and the horizon's height above
// true level in one least-squares fit. Stars carry the refraction signature (the atmosphere lifts
// low stars by a known amount that depends only on true altitude), so the fit can tell where
// "level" is even when the visible horizon is raised by terrain. Terrain height is a nuisance
// parameter with a prior set by the horizon type, so its uncertainty flows into the result.
function jointAdjust(cam0, z0, pairs, cues, opt) {
  const useK1 = !!opt.useK1, hasH = (cues.horizon || []).length > 0;
  const iZ = useK1 ? 5 : 4, iH = iZ + 2, np = hasH ? iH + 1 : iH;
  const basis = zz => { let e = cross([0, 0, 1], zz); if (Math.hypot(e[0], e[1], e[2]) < 1e-9) e = [0, 1, 0]; e = norm(e); return { e, n: cross(zz, e) }; };
  const a0 = (cues.horizonAlt || 0) * D2R, sTap = opt.sigTapRad, sTer = opt.terrainSigRad, sRef = opt.refrFrac == null ? 0.1 : opt.refrFrac;
  const apply = (st, d) => {
    const { e, n } = basis(st.z);
    return { R: mulMM(rodrigues([d[0], d[1], d[2]]), st.R), f: st.f * Math.exp(d[3]), k1: st.k1 + (useK1 ? d[4] : 0), cx: st.cx, cy: st.cy,
      z: norm(add(st.z, add(scale(e, d[iZ]), scale(n, d[iZ + 1])))), hoff: st.hoff + (hasH ? d[iH] : 0) };
  };
  const resid = (st, terrSig) => {
    const r = [];
    for (const p of pairs) {
      const alt = Math.asin(Math.max(-1, Math.min(1, dot(p.v0, st.z)))) * R2D;
      const v = refractToward(p.v0, st.z), q = project(st, v);
      const sR = sRef * refractionDeg(alt) * D2R * st.f; // refraction model uncertainty, px
      const sg = Math.sqrt(opt.sigStarPx * opt.sigStarPx + sR * sR);
      if (!q) { r.push(50, 50); continue; }
      r.push((q[0] - p.x) / sg, (q[1] - p.y) / sg);
    }
    for (const h of cues.horizon || []) { const a = unproject(st, h.x, h.y); r.push((dot(st.z, a) - Math.sin(a0 + st.hoff)) / sTap); }
    for (const L of cues.verticals || []) {
      const r1 = unproject(st, L[0].x, L[0].y), r2 = unproject(st, L[1].x, L[1].y), sep = angle(r1, r2); if (sep < 0.2 * D2R) continue;
      r.push(dot(st.z, norm(cross(r1, r2))) / Math.hypot(Math.SQRT2 * sTap / sep, opt.vertSigRad || LEAN));
    }
    if (hasH) r.push(st.hoff / (terrSig || sTer));
    return r;
  };
  const jac = (st, r0, terrSig) => { const J = []; for (let k = 0; k < np; k++) { const d = new Array(np).fill(0); d[k] = 1e-7; const rk = resid(apply(st, d), terrSig); J.push(rk.map((x, i) => (x - r0[i]) / 1e-7)); } return J; };
  let st = { R: cam0.R, f: cam0.f, k1: cam0.k1 || 0, cx: cam0.cx, cy: cam0.cy, z: z0, hoff: 0 };
  let r = resid(st), cost = r.reduce((s, x) => s + x * x, 0), lambda = 1e-3;
  for (let it = 0; it < 40; it++) {
    const J = jac(st, r);
    const A = [...Array(np)].map((_, a) => [...Array(np)].map((_, b) => { let s = 0; for (let i = 0; i < r.length; i++) s += J[a][i] * J[b][i]; return s; }));
    const g = [...Array(np)].map((_, a) => { let s = 0; for (let i = 0; i < r.length; i++) s -= J[a][i] * r[i]; return s; });
    let ok = false;
    for (let t = 0; t < 8; t++) {
      const d = solveLinear(A.map((row, i) => row.map((x, j) => i === j ? x * (1 + lambda) + 1e-12 : x)), g);
      if (!d) { lambda *= 10; continue; }
      const s2 = apply(st, d), r2 = resid(s2), c2 = r2.reduce((s, x) => s + x * x, 0);
      if (c2 < cost) { const rel = (cost - c2) / (cost + 1e-12); st = s2; r = r2; cost = c2; lambda = Math.max(lambda / 5, 1e-9); ok = true; if (rel < 1e-11) it = 999; break; }
      lambda *= 8;
    }
    if (!ok) break;
  }
  // covariance of the zenith (east, north tangent, radians); optionally with terrain known exactly
  const covZ = terrSig => {
    const r0 = resid(st, terrSig), J = jac(st, r0, terrSig);
    const A = [...Array(np)].map((_, a) => [...Array(np)].map((_, b) => { let s = 0; for (let i = 0; i < r0.length; i++) s += J[a][i] * J[b][i]; return s; }));
    const inv = [...Array(np)].map((_, i) => solveLinear(A.map(x => x.slice()), [...Array(np)].map((_, j) => i === j ? 1 : 0)));
    if (inv.some(x => !x)) return null;
    return { C: [[inv[iZ][iZ], inv[iZ][iZ + 1]], [inv[iZ + 1][iZ], inv[iZ + 1][iZ + 1]]], sH: hasH ? Math.sqrt(Math.max(0, inv[iH][iH])) : 0 };
  };
  const dof = Math.max(1, r.length - np), infl = Math.max(1, cost / dof);
  const full = covZ(), tight = hasH ? covZ(1e-7) : full;
  if (!full) return null;
  const scl = C => C.map(row => row.map(x => x * infl));
  const { e, n } = basis(st.z);
  return { cam: { R: st.R, f: st.f, k1: st.k1, cx: st.cx, cy: st.cy }, z: st.z, e, n, hoffDeg: st.hoff * R2D, hoffSigDeg: full.sH * Math.sqrt(infl) * R2D, C: scl(full.C), Ctight: scl(tight.C), chi2: cost, dof, infl };
}

// ---------- full pipeline ----------
const SYS = { sea: 0.04, flat: 0.15, hills: 0.5, mountains: 1.2, trees: 0.8, buildings: 0.6 }; // horizon systematic, deg
function dipDeg(heightM) { return 1.76 * Math.sqrt(Math.max(0, heightM)) / 60; }

function solve(inp) {
  const { W, H } = inp;
  const jd = inp.jd != null ? inp.jd : inp.jdDate;
  const cat = catalogOfDate(jd, inp.planets);
  const det = inp.detections || [];
  // id pairs
  const base = [];
  for (const id of inp.ids || []) {
    const c = cat.get(String(id.name).toLowerCase()); if (!c) continue;
    if (base.some(b => b.key === c.name.toLowerCase())) continue;
    base.push({ key: c.name.toLowerCase(), name: c.name, mag: c.mag, x: id.x, y: id.y, v0: c.v, source: id.source || "claude", manualOff: inp.excluded && inp.excluded.has(c.name.toLowerCase()) });
  }
  if (base.filter(b => !b.manualOff).length < 3) return { ok: false, reason: "few_stars", n: base.length };

  const horizonAlt = inp.horizonType === "sea" ? -dipDeg(inp.seaHeight == null ? 2 : inp.seaHeight) : 0;
  const cues = { horizon: inp.horizon || [], verticals: inp.verticals || [], tapSigmaPx: inp.tapSigmaPx || 1.2, horizonAlt, noConsensus: !!inp.noConsensus };
  let zen = null, cam = null, used = null, pairs = base.slice();
  for (let iter = 0; iter < 5; iter++) {
    const vecs = pairs.map(p => zen ? refractToward(p.v0, zen.z) : p.v0);
    const fitPairs = pairs.map((p, i) => ({ x: p.x, y: p.y, v: vecs[i], manualOff: p.manualOff }));
    const active = fitPairs.filter(p => !p.manualOff);
    const rf = robustFit(active, W, H, { f35: inp.f35, init: cam, k1: inp.k1 });
    cam = rf.cam; if (!cam) return { ok: false, reason: "fit_failed" };
    used = []; let k = 0; for (const p of pairs) used.push(p.manualOff ? false : rf.used[k++]);
    // extend with auto matches from detections (only once the fit is decent)
    if (iter >= 1 && det.length && cam.rmsPx < 0.25 * cam.f * D2R) {
      const tol = Math.max(4, 3 * cam.rmsPx);
      const taken = new Set(pairs.map(p => p.key));
      const claimed = pairs.map(p => [p.x, p.y]);
      for (const [key, c] of cat) {
        if (taken.has(key) || (inp.excluded && inp.excluded.has(key))) continue;
        const v = zen ? refractToward(c.v, zen.z) : c.v;
        if (zen && dot(v, zen.z) < Math.sin(1 * D2R)) continue;
        const q = project(cam, v); if (!q || q[0] < 4 || q[1] < 4 || q[0] > W - 4 || q[1] > H - 4) continue;
        let b1 = null, d1 = 1e9, d2 = 1e9;
        for (const s of det) { const d = Math.hypot(s.x - q[0], s.y - q[1]); if (d < d1) { d2 = d1; d1 = d; b1 = s; } else if (d < d2) d2 = d; }
        if (!b1 || d1 > tol || d2 < 2 * d1 + 2) continue;
        if (claimed.some(([x, y]) => Math.hypot(x - b1.x, y - b1.y) < 2)) continue;
        claimed.push([b1.x, b1.y]);
        pairs.push({ key, name: c.name, mag: c.mag, x: b1.x, y: b1.y, v0: c.v, source: "auto" });
      }
    }
    if (!cues.horizon.length && !cues.verticals.length) { zen = null; break; }
    const sv = pairs.filter((_, i) => used[i] !== false).map(p => p.v0);
    const z2 = solveZenith(cam, cues, sv.length ? sv : pairs.map(p => p.v0));
    if (!z2) { zen = null; break; }
    const moved = zen ? angle(zen.z, z2.z) : 1;
    zen = z2;
    if (moved < 1e-9 && iter >= 2) break;
  }
  // final residuals for every pair
  const finalVecs = pairs.map(p => zen ? refractToward(p.v0, zen.z) : p.v0);
  const degPx = cam.f * D2R;
  const matches = pairs.map((p, i) => {
    const q = project(cam, finalVecs[i]); const r = q ? Math.hypot(q[0] - p.x, q[1] - p.y) : NaN;
    return { name: p.name, key: p.key, mag: p.mag, x: p.x, y: p.y, px: q ? q[0] : null, py: q ? q[1] : null, resPx: r, resArcmin: r / degPx * 60, source: p.source, used: !p.manualOff && (i < used.length ? used[i] : true), manualOff: !!p.manualOff };
  });
  // re-evaluate "used" for auto matches with final tolerance
  const act = matches.filter(m => m.used).map(m => m.resPx).sort((a, b) => a - b);
  const med = act[Math.floor(act.length / 2)] || 1, tol = Math.max(3 * med, 2.5, 0.08 * degPx);
  for (const m of matches) if (m.used && m.resPx > tol) m.used = false;
  const usedM = matches.filter(m => m.used);
  const rmsPx = Math.sqrt(usedM.reduce((s, m) => s + m.resPx * m.resPx, 0) / Math.max(1, usedM.length));
  const fov = { h: 2 * Math.atan(W / 2 / cam.f) * R2D, v: 2 * Math.atan(H / 2 / cam.f) * R2D };
  const out = { ok: true, cam, matches, rmsPx, rmsArcmin: rmsPx / degPx * 60, nUsed: usedM.length, fov, zen: null, horizonAlt };
  if (!zen) { out.reason = "no_cues"; return out; }

  // final joint adjustment over everything that was kept
  const keep = matches.filter(m => m.used);
  const sysH = SYS[inp.horizonType] ?? 0.3;
  const cuesJ = { ...cues, verticals: zen.keptVerticals || cues.verticals };
  out.keptVerticals = cuesJ.verticals;
  const ja = jointAdjust(cam, zen.z, keep.map(m => ({ x: m.x, y: m.y, v0: pairs.find(p => p.key === m.key).v0 })), cuesJ, {
    sigStarPx: Math.max(0.35, rmsPx * 0.9), sigTapRad: (cues.tapSigmaPx || 1.2) / cam.f, terrainSigRad: inp.assumeLevel ? 1e-7 : sysH * D2R,
    vertSigRad: LEAN, useK1: keep.length >= 7 && inp.k1 !== false, refrFrac: 0.1
  });
  if (ja) { cam = ja.cam; out.cam = cam; zen = { ...zen, z: ja.z, e: ja.e, n: ja.n }; out.joint = { hoffDeg: ja.hoffDeg, hoffSigDeg: ja.hoffSigDeg, infl: ja.infl }; }
  const { ra, dec } = vec2radec(zen.z);
  out.lat = dec;
  const floor = Math.pow(0.004 * D2R, 2); // catalog / model floor
  // calibration: widen the formal uncertainty so ~90% of simulated fixes land inside 2 sigma
  const CAL = { sea: 1.1, flat: 1.15, hills: 1.5, mountains: 1.75, trees: 1.6, buildings: 1.4 };
  const kc = (zen.nh ? (CAL[inp.horizonType] || 1.5) : 1.3) ** 2;
  const C0 = ja ? ja.C : [[zen.C[0][0] + (sysH * D2R) ** 2, zen.C[0][1]], [zen.C[1][0], zen.C[1][1] + (sysH * D2R) ** 2]];
  const C = [[C0[0][0] * kc + floor, C0[0][1] * kc], [C0[1][0] * kc, C0[1][1] * kc + floor]];
  const Ct = ja ? [[ja.Ctight[0][0] * kc + floor, ja.Ctight[0][1] * kc], [ja.Ctight[1][0] * kc, ja.Ctight[1][1] * kc + floor]] : C;
  const cosLat = Math.max(0.02, Math.cos(dec * D2R));
  out.sigLatDeg = Math.sqrt(C[1][1]) * R2D;
  out.sigLatKm = out.sigLatDeg * 111.2;
  out.zen = zen;
  const trK = M => Math.sqrt(Math.max(0, (M[0][0] + M[1][1]) / 2)) * R2D * 111.2;
  out.budget = { horizonKm: Math.sqrt(Math.max(0, trK(C) ** 2 - trK(Ct) ** 2)), restKm: trK(Ct), timeKm: 0 };
  if (inp.jd != null) {
    let lon = ra - gmstDeg(inp.jd); lon = ((lon + 540) % 360) - 180;
    out.lon = lon;
    const sTimeDeg = (inp.timeSigmaSec || 0) * 360 / 86164.0905;
    out.sigLonDeg = Math.sqrt(C[0][0] * R2D * R2D / (cosLat * cosLat) + sTimeDeg * sTimeDeg);
    out.sigLonKm = out.sigLonDeg * 111.32 * cosLat;
    out.budget.timeKm = sTimeDeg * 111.32 * cosLat;
    const kE = 111.32 * R2D, kN = 111.2 * R2D;
    out.covKm = [[C[0][0] * kE * kE + out.budget.timeKm ** 2, C[0][1] * kE * kN], [C[1][0] * kE * kN, C[1][1] * kN * kN]];
  }
  // predicted horizon curve (apparent altitude horizonAlt) and local directions for drawing
  const { e, n } = zen; const z = zen.z, curve = []; const a0 = horizonAlt * D2R + (out.joint ? out.joint.hoffDeg * D2R : 0);
  for (let az = 0; az < 360; az += 0.5) { const A = az * D2R; const d = add(scale(add(scale(n, Math.cos(A)), scale(e, Math.sin(A))), Math.cos(a0)), scale(z, Math.sin(a0))); const q = project(cam, d); curve.push(q && q[0] > -W && q[0] < 2 * W && q[1] > -H && q[1] < 2 * H ? q : null); }
  out.horizonCurve = curve;
  // camera pointing in local coords
  const fwd = mulMtV(cam.R, [0, 0, 1]);
  out.pointing = { alt: Math.asin(dot(fwd, z)) * R2D, az: ((Math.atan2(dot(fwd, e), dot(fwd, n)) * R2D) + 360) % 360 };
  // measurements the trained accuracy model reads (uncalibrated "formal" errors + fit diagnostics)
  const hx = cues.horizon.map(p => p.x);
  const usedV = matches.filter(m => m.used).map(m => pairs.find(p => p.key === m.key).v0);
  const timeKm = (inp.timeSigmaSec || 0) * 360 / 86164.0905 * 111.32 * cosLat;
  out.features = {
    formalLatKm: Math.sqrt(C0[1][1] + floor) * R2D * 111.2,
    formalLonKm: Math.sqrt(Math.pow(Math.sqrt(C0[0][0] + floor) * R2D * 111.32, 2) + timeKm * timeKm),
    nUsed: usedV.length, rmsArcmin: out.rmsArcmin, fovDeg: fov.h,
    nh: zen.nh || 0, nv: zen.nv || 0, hSpan: hx.length > 1 ? (Math.max(...hx) - Math.min(...hx)) / W : 0,
    hoffSigDeg: out.joint && zen.nh ? out.joint.hoffSigDeg : 0, hoffDeg: out.joint && zen.nh ? out.joint.hoffDeg : 0,
    lowStarFrac: usedV.length ? usedV.filter(v => Math.asin(dot(v, z)) * R2D < 10).length / usedV.length : 0,
    camAlt: out.pointing.alt, lat: dec, timeSigmaSec: inp.timeSigmaSec || 0, horizonType: zen.nh ? (inp.horizonType || "flat") : "none"
  };
  return out;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dp = p2 - p1, dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const api = { jointAdjust, CATALOG, BY_NAME, catalogOfDate, precessionMatrix, gmstDeg, jdFromDate, refractionDeg, refractToward, radec2vec, vec2radec, project, unproject, camRay, fitCamera, robustFit, detectStars, toGray, snapEdge, solveZenith, solve, haversineKm, wahba, jacobiEigen, dipDeg, angle, norm, cross, dot, add, scale, mulMV, mulMtV, D2R, R2D };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Starfix = api;
})(typeof window !== "undefined" ? window : globalThis);
