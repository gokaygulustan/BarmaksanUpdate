'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Hash,
  User,
  PackageSearch,
  ChevronDown,
  ArrowRight,
  MailX,
  Tag,
  X,
  type LucideIcon,
} from 'lucide-react';
import { vendorsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  isTrPhoneComplete,
  maskTrPhoneLoose,
  TR_PHONE_ERROR,
  TR_PHONE_PLACEHOLDER,
} from '@/lib/phone';
import { EMAIL_ERROR, EMAIL_RE, normalizeEmail } from '@/lib/email';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  EmptyState,
  fieldClass,
  IconButton,
  InitialTile,
  PageHeader,
  PrimaryButton,
  SearchField,
  SelectMenu,
  SkeletonCards,
  Swap,
  Tile,
} from '@/components/page/Page';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

/* ─── Türkiye İl/İlçe Verisi ───────────────────────────────────────────── */
const CITIES: Record<string, string[]> = {
  Adana: ['Aladağ', 'Ceyhan', 'Çukurova', 'Feke', 'İmamoğlu', 'Karaisalı', 'Karataş', 'Kozan', 'Pozantı', 'Saimbeyli', 'Sarıçam', 'Seyhan', 'Tufanbeyli', 'Yumurtalık', 'Yüreğir'],
  Ankara: ['Altındağ', 'Ayaş', 'Bala', 'Beypazarı', 'Çamlıdere', 'Çankaya', 'Çubuk', 'Elmadağ', 'Etimesgut', 'Evren', 'Gölbaşı', 'Güdül', 'Haymana', 'Kalecik', 'Kahramankazan', 'Keçiören', 'Kızılcahamam', 'Mamak', 'Nallıhan', 'Polatlı', 'Pursaklar', 'Sincan', 'Şereflikoçhisar', 'Yenimahalle'],
  İstanbul: ['Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy', 'Başakşehir', 'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece', 'Çatalca', 'Çekmeköy', 'Esenler', 'Esenyurt', 'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy', 'Kağıthane', 'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sarıyer', 'Silivri', 'Sultanbeyli', 'Sultangazi', 'Şile', 'Şişli', 'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu'],
  İzmir: ['Aliağa', 'Balçova', 'Bayındır', 'Bayraklı', 'Bergama', 'Beydağ', 'Bornova', 'Buca', 'Çeşme', 'Çiğli', 'Dikili', 'Foça', 'Gaziemir', 'Güzelbahçe', 'Karabağlar', 'Karaburun', 'Karşıyaka', 'Kemalpaşa', 'Kınık', 'Kiraz', 'Konak', 'Menderes', 'Menemen', 'Narlıdere', 'Ödemiş', 'Seferihisar', 'Selçuk', 'Tire', 'Torbalı', 'Urla'],
  Bursa: ['Büyükorhan', 'Gemlik', 'Gürsu', 'Harmancık', 'İnegöl', 'İznik', 'Karacabey', 'Keles', 'Kestel', 'Mudanya', 'Mustafakemalpaşa', 'Nilüfer', 'Orhaneli', 'Orhangazi', 'Osmangazi', 'Yenişehir', 'Yıldırım'],
  Antalya: ['Akseki', 'Aksu', 'Alanya', 'Demre', 'Döşemealtı', 'Elmalı', 'Finike', 'Gazipaşa', 'Gündoğmuş', 'İbradı', 'Kaş', 'Kemer', 'Kepez', 'Konyaaltı', 'Korkuteli', 'Kumluca', 'Manavgat', 'Muratpaşa', 'Serik'],
  Konya: ['Ahırlı', 'Akören', 'Akşehir', 'Altınekin', 'Beyşehir', 'Bozkır', 'Cihanbeyli', 'Çeltik', 'Çumra', 'Derbent', 'Derebucak', 'Doğanhisar', 'Emirgazi', 'Ereğli', 'Güneysınır', 'Hadim', 'Halkapınar', 'Hüyük', 'Ilgın', 'Kadınhanı', 'Karapınar', 'Karatay', 'Kulu', 'Meram', 'Sarayönü', 'Selçuklu', 'Seydişehir', 'Taşkent', 'Tuzlukçu', 'Yalıhüyük', 'Yunak'],
  Adıyaman: ['Besni', 'Çelikhan', 'Gerger', 'Gölbaşı', 'Kahta', 'Merkez', 'Samsat', 'Sincik', 'Tut'],
  Afyonkarahisar: ['Başmakçı', 'Bayat', 'Bolvadin', 'Çay', 'Çobanlar', 'Dazkırı', 'Dinar', 'Emirdağ', 'Evciler', 'Hocalar', 'İhsaniye', 'İscehisar', 'Kızılören', 'Merkez', 'Sandıklı', 'Sinanpaşa', 'Sultandağı', 'Şuhut'],
  Ağrı: ['Diyadin', 'Doğubayazıt', 'Eleşkirt', 'Hamur', 'Merkez', 'Patnos', 'Taşlıçay', 'Tutak'],
  Aksaray: ['Ağaçören', 'Eskil', 'Gülağaç', 'Güzelyurt', 'Merkez', 'Ortaköy', 'Sarıyahşi', 'Sultanhanı'],
  Amasya: ['Göynücek', 'Gümüşhacıköy', 'Hamamözü', 'Merkez', 'Merzifon', 'Suluova', 'Taşova'],
  Ardahan: ['Çıldır', 'Damal', 'Göle', 'Hanak', 'Merkez', 'Posof'],
  Artvin: ['Ardanuç', 'Arhavi', 'Borçka', 'Hopa', 'Kemalpaşa', 'Merkez', 'Murgul', 'Şavşat', 'Yusufeli'],
  Aydın: ['Bozdoğan', 'Buharkent', 'Çine', 'Didim', 'Efeler', 'Germencik', 'İncirliova', 'Karacasu', 'Karpuzlu', 'Koçarlı', 'Köşk', 'Kuşadası', 'Kuyucak', 'Merkez', 'Nazilli', 'Söke', 'Sultanhisar', 'Yenipazar'],
  Balıkesir: ['Altıeylül', 'Ayvalık', 'Balya', 'Bandırma', 'Bigadiç', 'Burhaniye', 'Dursunbey', 'Edremit', 'Erdek', 'Gömeç', 'Gönen', 'Havran', 'İvrindi', 'Karesi', 'Kepsut', 'Manyas', 'Marmara', 'Savaştepe', 'Sındırgı', 'Susurluk'],
  Bartın: ['Arit', 'Kurucaşile', 'Merkez', 'Ulus'],
  Batman: ['Beşiri', 'Gercüş', 'Hasankeyf', 'Kozluk', 'Merkez', 'Sason'],
  Bayburt: ['Aydıntepe', 'Demirözü', 'Merkez'],
  Bilecik: ['Bozüyük', 'Gölpazarı', 'İnhisar', 'Merkez', 'Osmaneli', 'Pazaryeri', 'Söğüt', 'Yenipazar'],
  Bingöl: ['Adaklı', 'Genç', 'Karlıova', 'Kiğı', 'Merkez', 'Solhan', 'Yayladere', 'Yedisu'],
  Bitlis: ['Adilcevaz', 'Ahlat', 'Güroymak', 'Hizan', 'Merkez', 'Mutki', 'Tatvan'],
  Bolu: ['Dörtdivan', 'Gerede', 'Göynük', 'Kıbrıscık', 'Mengen', 'Merkez', 'Mudurnu', 'Seben', 'Yeniçağa'],
  Burdur: ['Ağlasun', 'Altınyayla', 'Bucak', 'Çavdır', 'Çeltikçi', 'Gölhisar', 'Karamanlı', 'Kemer', 'Merkez', 'Tefenni', 'Yeşilova'],
  Çanakkale: ['Ayvacık', 'Bayramiç', 'Biga', 'Bozcaada', 'Çan', 'Eceabat', 'Ezine', 'Gelibolu', 'Gökçeada', 'Lapseki', 'Merkez', 'Yenice'],
  Çankırı: ['Atkaracalar', 'Bayramören', 'Çerkeş', 'Eldivan', 'Ilgaz', 'Khanl', 'Korgun', 'Kurşunlu', 'Merkez', 'Orta', 'Şabanözü', 'Yapraklı'],
  Çorum: ['Alaca', 'Bayat', 'Boğazkale', 'Dodurga', 'İskilip', 'Kargı', 'Laçin', 'Mecitözü', 'Merkez', 'Oğuzlar', 'Ortaköy', 'Osmancık', 'Sungurlu', 'Uğurludağ'],
  Denizli: ['Acıpayam', 'Babadağ', 'Baklan', 'Bekilli', 'Beyağaç', 'Bozkurt', 'Buldan', 'Çal', 'Çameli', 'Çardak', 'Çivril', 'Güney', 'Honaz', 'Kale', 'Merkez', 'Merkezefendi', 'Pamukkale', 'Sarayköy', 'Serinhisar', 'Tavas'],
  Diyarbakır: ['Bağlar', 'Bismil', 'Çermik', 'Çınar', 'Çüngüş', 'Dicle', 'Eğil', 'Ergani', 'Hani', 'Hazro', 'Kayapınar', 'Kocaköy', 'Kulp', 'Lice', 'Silvan', 'Sur', 'Yenişehir'],
  Düzce: ['Akçakoca', 'Cumayeri', 'Çilimli', 'Gölyaka', 'Gümüşova', 'Kaynaşlı', 'Merkez', 'Yığılca'],
  Edirne: ['Enez', 'Havsa', 'İpsala', 'Keşan', 'Lalapaşa', 'Meriç', 'Merkez', 'Süloğlu', 'Uzunköprü'],
  Elazığ: ['Ağın', 'Alacakaya', 'Arıcak', 'Baskil', 'Karakoçan', 'Keban', 'Kovancılar', 'Maden', 'Merkez', 'Palu', 'Sivrice'],
  Erzincan: ['Çayırlı', 'İliç', 'Kemah', 'Kemaliye', 'Merkez', 'Otlukbeli', 'Refahiye', 'Tercan', 'Üzümlü'],
  Erzurum: ['Aşkale', 'Aziziye', 'Çat', 'Hınıs', 'Horasan', 'İspir', 'Karaçoban', 'Karayazı', 'Köprüköy', 'Merkez', 'Narman', 'Oltu', 'Olur', 'Palandöken', 'Pasinler', 'Pazaryolu', 'Şenkaya', 'Tekman', 'Tortum', 'Uzundere', 'Yakutiye'],
  Eskişehir: ['Alpu', 'Beylikova', 'Çifteler', 'Günyüzü', 'Han', 'İnönü', 'Mahmudiye', 'Mihalgazi', 'Mihalıççık', 'Odunpazarı', 'Sarıcakaya', 'Seyitgazi', 'Sivrihisar', 'Tepebaşı'],
  Gaziantep: ['Araban', 'İslahiye', 'Karkamış', 'Nizip', 'Nurdağı', 'Oğuzeli', 'Şahinbey', 'Şehitkamil', 'Yavuzeli'],
  Giresun: ['Alucra', 'Bulancak', 'Çamoluk', 'Çanakçı', 'Dereli', 'Doğankent', 'Espiye', 'Eynesil', 'Gorele', 'Güce', 'Keşap', 'Merkez', 'Piraziz', 'Şebinkarahisar', 'Tirebolu', 'Yağlıdere'],
  Gümüşhane: ['Kelkit', 'Köse', 'Kürtün', 'Merkez', 'Şiran', 'Torul'],
  Hakkari: ['Çukurca', 'Derecik', 'Merkez', 'Şemdinli', 'Yüksekova'],
  Hatay: ['Altınözü', 'Antakya', 'Arsuz', 'Belen', 'Defne', 'Dörtyol', 'Erzin', 'Hassa', 'İskenderun', 'Kırıkhan', 'Kumlu', 'Payas', 'Reyhanlı', 'Samandağ', 'Serinyol', 'Yayladağı'],
  Iğdır: ['Aralık', 'Karakoyunlu', 'Merkez', 'Tuzluca'],
  Isparta: ['Aksu', 'Atabey', 'Eğirdir', 'Gelendost', 'Gönen', 'Keçiborlu', 'Merkez', 'Senirkent', 'Sütçüler', 'Şarkikaraağaç', 'Uluborlu', 'Yalvaç', 'Yenişarbademli'],
  Kahramanmaraş: ['Afşin', 'Andırın', 'Çağlayancerit', 'Dulkadiroğlu', 'Ekinözü', 'Elbistan', 'Göksun', 'Nurhak', 'Onikişubat', 'Pazarcık', 'Türkoğlu'],
  Karabük: ['Eflani', 'Eskipazar', 'Merkez', 'Ovacık', 'Safranbolu', 'Yenice'],
  Karaman: ['Ayrancı', 'Başyayla', 'Ermenek', 'Kazımkarabekir', 'Merkez', 'Sarıveliler'],
  Kars: ['Akyaka', 'Arpaçay', 'Digor', 'Kağızman', 'Merkez', 'Sarıkamış', 'Selim', 'Susuz'],
  Kastamonu: ['Abana', 'Ağlı', 'Araç', 'Azdavay', 'Bozkurt', 'Cide', 'Çatalzeytin', 'Daday', 'Devrekani', 'Doğanyurt', 'Hanönü', 'İhsangazi', 'İnebolu', 'Küre', 'Merkez', 'Pınarbaşı', 'Seydiler', 'Şenpazar', 'Taşköprü', 'Tosya'],
  Kayseri: ['Akkışla', 'Bünyan', 'Develi', 'Felahiye', 'Hacılar', 'İncesu', 'Kocasinan', 'Melikgazi', 'Özvatan', 'Pınarbaşı', 'Sarıoğlan', 'Sarız', 'Talas', 'Tomarza', 'Yahyalı', 'Yeşilhisar'],
  Kilis: ['Elbeyli', 'Merkez', 'Musabeyli', 'Polateli'],
  Kırıkkale: ['Bahşili', 'Balışeyh', 'Çelebi', 'Delice', 'Karakeçili', 'Keskin', 'Merkez', 'Sulakyurt', 'Yahşihan'],
  Kırklareli: ['Babaeski', 'Demirköy', 'Kofçaz', 'Lüleburgaz', 'Merkez', 'Pehlivanköy', 'Pınarhisar', 'Vize'],
  Kırşehir: ['Akçakent', 'Akpınar', 'Boztepe', 'Çiçekdağı', 'Kaman', 'Merkez', 'Mucur'],
  Kocaeli: ['Başiskele', 'Çayırova', 'Darıca', 'Derince', 'Dilovası', 'Gebze', 'Gölcük', 'İzmit', 'Kandıra', 'Karamürsel', 'Kartepe', 'Körfez'],
  Kütahya: ['Altıntaş', 'Aslanapa', 'Çavdarhisar', 'Domaniç', 'Dumlupınar', 'Emet', 'Gediz', 'Hisarcık', 'Merkez', 'Pazarlar', 'Simav', 'Şaphane', 'Tavşanlı'],
  Malatya: ['Akçadağ', 'Arapgir', 'Arguvan', 'Battalgazi', 'Darende', 'Doğanşehir', 'Doğanyol', 'Hekimhan', 'Kale', 'Kuluncak', 'Pütürge', 'Yazıhan', 'Yeşilyurt'],
  Manisa: ['Ahmetli', 'Akhisar', 'Alaşehir', 'Demirci', 'Gölmarmara', 'Gördes', 'Köprübaşı', 'Kula', 'Merkez', 'Salihli', 'Sarıgöl', 'Saruhanlı', 'Selendi', 'Soma', 'Şehzadeler', 'Turgutlu', 'Yunusemre'],
  Mardin: ['Artuklu', 'Dargeçit', 'Derik', 'Kızıltepe', 'Mazıdağı', 'Midyat', 'Nusaybin', 'Ömerli', 'Savur', 'Yeşilli'],
  Mersin: ['Akdeniz', 'Anamur', 'Aydıncık', 'Bozyazı', 'Çamlıyayla', 'Erdemli', 'Gülnar', 'Mezitli', 'Mut', 'Silifke', 'Tarsus', 'Toroslar', 'Yenişehir'],
  Muğla: ['Bodrum', 'Dalaman', 'Datça', 'Fethiye', 'Kavaklıdere', 'Köyceğiz', 'Marmaris', 'Menteşe', 'Milas', 'Ortaca', 'Seydikemer', 'Ula', 'Yatağan'],
  Muş: ['Bulanık', 'Hasköy', 'Korkut', 'Malazgirt', 'Merkez', 'Varto'],
  Nevşehir: ['Acıgöl', 'Avanos', 'Derinkuyu', 'Gülşehir', 'Hacıbektaş', 'Kozaklı', 'Merkez', 'Ürgüp'],
  Niğde: ['Altunhisar', 'Bor', 'Çamardı', 'Çiftlik', 'Merkez', 'Ulukışla'],
  Ordu: ['Akkuş', 'Altınordu', 'Aybastı', 'Çamaş', 'Çatalpınar', 'Çaybaşı', 'Fatsa', 'Gölköy', 'Gülyalı', 'Gürgentepe', 'İkizce', 'Kabadüz', 'Kabataş', 'Korgan', 'Kumru', 'Mesudiye', 'Perşembe', 'Ulubey', 'Ünye'],
  Osmaniye: ['Bahçe', 'Düziçi', 'Hasanbeyli', 'Kadirli', 'Merkez', 'Sumbas', 'Toprakkale'],
  Rize: ['Ardeşen', 'Çamlıhemşin', 'Çayeli', 'Derepazarı', 'Fındıklı', 'Güneysu', 'Hemşin', 'İkizdere', 'İyidere', 'Kalkandere', 'Merkez', 'Pazar'],
  Sakarya: ['Adapazarı', 'Akyazı', 'Arifiye', 'Erenler', 'Ferizli', 'Geyve', 'Hendek', 'Karapürçek', 'Karasu', 'Kaynarca', 'Kocaali', 'Mithatpaşa', 'Pamukova', 'Sapanca', 'Serdivan', 'Söğütlü', 'Taraklı'],
  Samsun: ['19 Mayıs', 'Alaçam', 'Asarcık', 'Atakum', 'Ayvacık', 'Bafra', 'Canik', 'Çarşamba', 'Havza', 'İlkadım', 'Kavak', 'Ladik', 'Salıpazarı', 'Tekkeköy', 'Terme', 'Vezirköprü', 'Yakakent'],
  Siirt: ['Baykan', 'Eruh', 'Kurtalan', 'Merkez', 'Pervari', 'Şirvan', 'Tillo'],
  Sinop: ['Ayancık', 'Boyabat', 'Dikmen', 'Durağan', 'Erfelek', 'Gerze', 'Merkez', 'Sarayduzu', 'Türkeli'],
  Sivas: ['Altınyayla', 'Divriği', 'Doğanşar', 'Gemerek', 'Gölova', 'Hafik', 'İmranlı', 'Kangal', 'Koyulhisar', 'Merkez', 'Şarkışla', 'Ulaş', 'Yıldızeli', 'Zara'],
  Şanlıurfa: ['Akçakale', 'Birecik', 'Bozova', 'Ceylanpınar', 'Eyyübiye', 'Halfeti', 'Haliliye', 'Harran', 'Hilvan', 'Karaköprü', 'Siverek', 'Suruç', 'Viranşehir'],
  Şırnak: ['Beytüşşebap', 'Cizre', 'Güçlükonak', 'İdil', 'Merkez', 'Silopi', 'Uludere'],
  Tekirdağ: ['Çerkezköy', 'Çorlu', 'Ergene', 'Hayrabolu', 'Kapaklı', 'Malkara', 'Marmaraereğlisi', 'Muratlı', 'Saray', 'Süleymanpaşa', 'Şarköy'],
  Tokat: ['Almus', 'Artova', 'Başçiftlik', 'Erbaa', 'Merkez', 'Niksar', 'Pazar', 'Reşadiye', 'Sulusaray', 'Turhal', 'Yeşilyurt', 'Zile'],
  Trabzon: ['Akçaabat', 'Araklı', 'Arsin', 'Beşikdüzü', 'Çarşıbaşı', 'Çaykara', 'Dernekpazarı', 'Düzköy', 'Hayrat', 'Köprübaşı', 'Maçka', 'Merkez', 'Of', 'Ortahisar', 'Sürmene', 'Şalpazarı', 'Tonya', 'Vakfıkebir', 'Yomra'],
  Tunceli: ['Çemişgezek', 'Hozat', 'Mazgirt', 'Merkez', 'Nazımiye', 'Ovacık', 'Pertek', 'Pülümür'],
  Uşak: ['Banaz', 'Eşme', 'Karahallı', 'Merkez', 'Sivaslı', 'Ulubey'],
  Van: ['Bahçesaray', 'Başkale', 'Çaldıran', 'Çatak', 'Edremit', 'Erciş', 'Gevaş', 'Gürpınar', 'İpekyolu', 'Merkez', 'Muradiye', 'Özalp', 'Saray', 'Tuşba'],
  Yalova: ['Altınova', 'Armutlu', 'Çiftlikköy', 'Çınarcık', 'Merkez', 'Termal'],
  Yozgat: ['Akdağmadeni', 'Aydıncık', 'Boğazlıyan', 'Çandır', 'Çayıralan', 'Çekerek', 'Kadışehri', 'Merkez', 'Saraykent', 'Sarıkaya', 'Şefaatli', 'Sorgun', 'Yenifakılı', 'Yerköy'],
  Zonguldak: ['Alaplı', 'Çaycuma', 'Devrek', 'Ereğli', 'Gökçebey', 'Kilimli', 'Kozlu', 'Merkez'],
};

const CITY_LIST = Object.keys(CITIES).sort((a, b) => a.localeCompare(b, 'tr'));

/* ─── Types ─────────────────────────────────────────────────────────────── */
type VendorContact = {
  id?: string;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
};

type Vendor = {
  id: string;
  name: string;
  contactName?: string;
  contactEmail: string;
  /** Teklif bildirimi bu adreslere de gider (ana e-posta ile birlikte). */
  extraContactEmails?: string[];
  contactPhone?: string;
  extraContactPhones?: string[];
  taxId?: string;
  city?: string;
  district?: string;
  address?: string;
  /** Ne sattığı: MOTOR, PASLANMAZ SAC … */
  categories?: string[];
  notes?: string | null;
  contacts?: VendorContact[];
  moduleId?: string;
  importSource?: string | null;
  createdAt: string;
};

type VendorFormData = {
  name: string;
  /** Tek liste: ilk satır birincil yetkili, tedarikçi kartındaki ana iletişim odur. */
  people: VendorContact[];
  taxId: string;
  city: string;
  district: string;
  address: string;
  categories: string[];
  notes: string;
  moduleId: string;
};

/** API'ye giden gövde: birincil kişi ana alanlara da yazılır (eski alanlar korunuyor). */
type VendorPayload = Omit<VendorFormData, 'people'> & {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contacts: VendorContact[];
};

const blankPerson = (): VendorContact => ({ name: '', title: '', phone: '', email: '', notes: '' });

const emptyForm = (): VendorFormData => ({
  name: '',
  people: [blankPerson()],
  taxId: '',
  city: '',
  district: '',
  address: '',
  categories: [],
  notes: '',
  moduleId: 'SATIN_ALMA',
});

const phoneKey = (value?: string | null) => String(value ?? '').replace(/\D/g, '').slice(-10);

/**
 * Kartın ana iletişim alanları ile yetkili kişi satırlarını tek listede toplar.
 * Ana adres/numara kişilerden birinde zaten varsa tekrar satır açılmaz.
 */
const vendorToPeople = (v: Vendor): VendorContact[] => {
  const people = (v.contacts || []).map((c) => ({ ...c }));
  const mainEmail = normalizeEmail(v.contactEmail || '');
  const mainPhone = phoneKey(v.contactPhone);
  const covered = people.some(
    (c) =>
      (mainEmail && normalizeEmail(c.email || '') === mainEmail) ||
      (!mainEmail && mainPhone && phoneKey(c.phone) === mainPhone),
  );
  if (!covered && (mainEmail || mainPhone || v.contactName)) {
    people.unshift({
      name: v.contactName || '',
      title: '',
      phone: v.contactPhone || '',
      email: v.contactEmail || '',
      notes: '',
    });
  }
  return people.length ? people : [blankPerson()];
};

const vendorToForm = (v: Vendor | null): VendorFormData =>
  v
    ? {
        name: v.name,
        people: vendorToPeople(v),
        taxId: v.taxId || '',
        city: v.city || '',
        district: v.district || '',
        address: v.address || '',
        categories: [...(v.categories || [])],
        notes: v.notes || '',
        moduleId: v.moduleId || 'SATIN_ALMA',
      }
    : emptyForm();

/** Türkçe karakter / büyük-küçük harf farkını yok sayan arama anahtarı */
const fold = (value: unknown) =>
  String(value ?? '')
    .replace(/[İIı]/g, 'i')
    .replace(/[Şş]/g, 's')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase();

/* ─── Vendor Form Dialog ────────────────────────────────────────────────── */
function VendorFormDialog({
  open,
  onClose,
  editingVendor,
  onSave,
  isPending,
  categorySuggestions,
  canChooseModule,
}: {
  open: boolean;
  onClose: () => void;
  editingVendor: Vendor | null;
  onSave: (data: VendorPayload) => void;
  isPending: boolean;
  categorySuggestions: string[];
  canChooseModule: boolean;
}) {
  const [form, setForm] = useState<VendorFormData>(() => vendorToForm(editingVendor));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [categoryDraft, setCategoryDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(vendorToForm(editingVendor));
    setFormErrors({});
    setCategoryDraft('');
  }, [open, editingVendor]);

  const districts = form.city ? CITIES[form.city] || [] : [];

  const addCategories = (raw: string) => {
    const incoming = raw
      .split(',')
      .map((t) => t.replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR'))
      .filter(Boolean);
    if (!incoming.length) return;
    setForm((f) => {
      const seen = new Set(f.categories.map((c) => fold(c)));
      const merged = [...f.categories];
      for (const tag of incoming) {
        if (seen.has(fold(tag))) continue;
        seen.add(fold(tag));
        merged.push(tag);
      }
      return { ...f, categories: merged };
    });
    setCategoryDraft('');
  };

  const setPerson = (index: number, field: keyof VendorContact, value: string) => {
    setForm((f) => ({
      ...f,
      people: f.people.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
    setFormErrors((e) => {
      const next = { ...e };
      delete next.people;
      return next;
    });
  };

  const set = (field: keyof VendorFormData, value: string | string[] | VendorContact[]) => {
    setForm((f) => {
      const updated = { ...f, [field]: value } as VendorFormData;
      if (field === 'city') updated.district = ''; // reset district on city change
      return updated;
    });
    setFormErrors((e) => {
      const next = { ...e };
      delete next[field as string];
      return next;
    });
  };

  const emailRe = EMAIL_RE;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Firma adı zorunludur';

    if (form.people.length > 25) errs.people = 'En fazla 25 kişi ekleyebilirsiniz';
    const seenEmails = new Set<string>();
    for (const [idx, person] of form.people.entries()) {
      const email = normalizeEmail(person.email || '');
      const phone = String(person.phone || '').trim();
      if (email && !emailRe.test(email)) {
        errs.people = `${idx + 1}. kişi: ${EMAIL_ERROR}`;
        break;
      }
      // Dahili/açıklama yazılmış satırları maskeye zorlamıyoruz
      if (phone && !/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(phone) && !isTrPhoneComplete(phone)) {
        errs.people = `${idx + 1}. kişi: ${TR_PHONE_ERROR}`;
        break;
      }
      if (email && seenEmails.has(email)) {
        errs.people = `Aynı e-posta birden fazla satırda: ${email}`;
        break;
      }
      if (email) seenEmails.add(email);
    }

    const reachable = form.people.some((p) => p.email?.trim() || p.phone?.trim());
    if (!errs.people && !reachable) {
      errs.people = 'En az bir kişide e-posta veya telefon olmalı';
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const { people, ...rest } = form;
    const contacts = people
      .map((p) => ({
        ...p,
        name: (p.name || '').trim(),
        title: (p.title || '').trim(),
        email: normalizeEmail(p.email || ''),
        phone: (p.phone || '').trim(),
        notes: (p.notes || '').trim(),
      }))
      .filter((p) => p.name || p.email || p.phone);
    const primary = contacts[0];
    // Birincil kişi ayrıca kartın ana iletişim alanlarına yazılır
    onSave({
      ...rest,
      contactName: primary?.name || '',
      contactEmail: primary?.email || '',
      contactPhone: primary?.phone || '',
      contacts,
    });
  };

  const inputClass = (field: keyof VendorFormData) =>
    `border-border bg-background text-foreground ${formErrors[field] ? 'border-destructive ring-1 ring-destructive' : ''}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[600px] border-border max-h-[90vh] overflow-y-auto"
        style={{ background: 'hsl(0, 0%, 11%)' }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            {editingVendor ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi Ekle'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Tedarikçi firmanın cari bilgilerini girin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Firma Bilgileri */}
          <div
            className="p-4 rounded-lg space-y-4"
            style={{ background: 'hsl(0, 0%, 10%)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Firma Bilgileri
            </p>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label className="text-foreground text-sm">
                  Firma Adı <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Örn: Acme Demir Çelik A.Ş."
                  className={inputClass('name')}
                />
                {formErrors.name && (
                  <p className="text-destructive text-xs">{formErrors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-foreground text-sm">Vergi Kimlik No</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={form.taxId}
                    onChange={(e) => set('taxId', e.target.value)}
                    placeholder="1234567890"
                    className={`pl-10 ${inputClass('taxId')}`}
                  />
                </div>
              </div>

              {canChooseModule && (
                <div className="space-y-1.5">
                  <Label className="text-foreground text-sm">Hangi modülün tedarikçisi</Label>
                  <div className="relative">
                    <select
                      value={form.moduleId}
                      onChange={(e) => set('moduleId', e.target.value)}
                      className="w-full bg-background border border-border h-10 px-3 pr-9 py-2 rounded-md outline-none text-sm focus:ring-1 focus:ring-primary hover:border-primary transition-colors text-foreground appearance-none"
                    >
                      <option value="SATIN_ALMA">Satın Alma</option>
                      <option value="URETIM_PLANLAMA">Üretim Planlama</option>
                      <option value="YEDEK_PARCA">Yedek Parça</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Tedarikçi yalnızca seçilen modülün taleplerinde listelenir.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Yetkili Bilgileri */}
          <div
            className="p-4 rounded-lg space-y-4"
            style={{ background: 'hsl(0, 0%, 10%)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Yetkili / İletişim Bilgileri
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => set('people', [...form.people, blankPerson()])}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Kişi ekle
              </Button>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Firmada kaç kişiyle görüşüyorsanız hepsini alt alta ekleyin. Talep, teklif ve
              hatırlatma e-postaları buradaki tüm adreslere, SMS de tüm numaralara gider. İlk kişi
              birincil sayılır; ikinci cep / sabit hat için ad yazmadan sadece numara da
              girebilirsiniz.
            </p>
            {formErrors.people && <p className="text-destructive text-xs">{formErrors.people}</p>}

            <div className="space-y-2">
              {form.people.map((person, idx) => (
                <div
                  key={person.id || idx}
                  className="rounded-lg border border-border/50 p-3 space-y-2"
                  style={{ background: 'hsl(0, 0%, 12%)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {idx === 0 ? 'Birincil kişi' : `${idx + 1}. kişi`}
                    </span>
                    {form.people.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          set(
                            'people',
                            form.people.filter((_, i) => i !== idx),
                          )
                        }
                        aria-label="Kişiyi kaldır"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={person.name || ''}
                        onChange={(e) => setPerson(idx, 'name', e.target.value)}
                        placeholder="Ad Soyad"
                        className="pl-10"
                      />
                    </div>
                    <Input
                      value={person.title || ''}
                      onChange={(e) => setPerson(idx, 'title', e.target.value)}
                      placeholder="Görev (ör. muhasebe)"
                    />
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        inputMode="tel"
                        value={person.phone || ''}
                        onChange={(e) => setPerson(idx, 'phone', maskTrPhoneLoose(e.target.value))}
                        placeholder={TR_PHONE_PLACEHOLDER}
                        className="pl-10"
                      />
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="email"
                        inputMode="email"
                        value={person.email || ''}
                        onChange={(e) => setPerson(idx, 'email', e.target.value)}
                        onBlur={(e) => setPerson(idx, 'email', normalizeEmail(e.target.value))}
                        placeholder="kisi@firma.com"
                        className="pl-10"
                      />
                    </div>
                    <Input
                      value={person.notes || ''}
                      onChange={(e) => setPerson(idx, 'notes', e.target.value)}
                      placeholder="Not (opsiyonel)"
                      className="sm:col-span-2"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ne satıyor + not */}
          <div className="p-4 rounded-lg space-y-4" style={{ background: 'hsl(0, 0%, 10%)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Ne Satıyor / Notlar
            </p>

            <div className="space-y-2">
              <Label className="text-foreground text-sm">Etiketler</Label>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Talep ekranındaki arama bu etiketlere bakar. &quot;MOTOR&quot; yazan biri bu firmayı
                bulabilsin diye ne sattığını ekleyin. Enter veya virgülle ekleyin.
              </p>
              {form.categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.categories.map((category) => (
                    <span
                      key={category}
                      className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                    >
                      {category}
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            'categories',
                            form.categories.filter((c) => c !== category),
                          )
                        }
                        className="text-primary/70 hover:text-primary"
                        aria-label={`${category} etiketini kaldır`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  list="vendor-category-suggestions"
                  value={categoryDraft}
                  onChange={(e) => setCategoryDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addCategories(categoryDraft);
                    }
                  }}
                  placeholder="Örn: MOTOR, PASLANMAZ SAC"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => addCategories(categoryDraft)}
                >
                  Ekle
                </Button>
              </div>
              <datalist id="vendor-category-suggestions">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">Firma notu</Label>
              <Textarea
                value={form.notes}
                onChange={(e: any) => set('notes', e.target.value)}
                placeholder="Örn: ASİL ÇELİK - ETLİ BORU - TRANSMİSYON. Notlar da aramada taranır."
                className="bg-background border-border text-foreground min-h-[70px]"
              />
            </div>
          </div>

          {/* Adres Bilgileri */}
          <div
            className="p-4 rounded-lg space-y-4"
            style={{ background: 'hsl(0, 0%, 10%)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Adres Bilgileri
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Şehir */}
              <div className="space-y-1.5">
                <Label className="text-foreground text-sm">Şehir</Label>
                <div className="relative">
                  <select
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                    className="w-full bg-background border border-border h-10 px-3 pr-9 py-2 rounded-md outline-none text-sm focus:ring-1 focus:ring-primary hover:border-primary transition-colors text-foreground appearance-none"
                  >
                    <option value="">-- Şehir Seçin --</option>
                    {CITY_LIST.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              {/* İlçe */}
              <div className="space-y-1.5">
                <Label className="text-foreground text-sm">İlçe</Label>
                <div className="relative">
                  <select
                    value={form.district}
                    onChange={(e) => set('district', e.target.value)}
                    disabled={!form.city}
                    className="w-full bg-background border border-border h-10 px-3 pr-9 py-2 rounded-md outline-none text-sm focus:ring-1 focus:ring-primary hover:border-primary transition-colors text-foreground appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">-- İlçe Seçin --</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              {/* Tam Adres */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-foreground text-sm">Tam Adres</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Textarea
                    value={form.address}
                    onChange={(e: any) => set('address', e.target.value)}
                    placeholder="Mahalle, sokak, bina no..."
                    className={`pl-10 bg-background border-border text-foreground min-h-[70px] ${inputClass('address')}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="hover:bg-white/10">
              İptal
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground font-semibold hover:opacity-90"
              disabled={isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingVendor ? 'Değişiklikleri Kaydet' : 'Tedarikçiyi Kaydet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Ana Sayfa ─────────────────────────────────────────────────────────── */
export default function VendorsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [onlyUntagged, setOnlyUntagged] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [tagEditFor, setTagEditFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [onlyNoEmail, setOnlyNoEmail] = useState(false);
  /** Kartı açık firma; null iken firma sayfası kapalı. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'name' | 'new'>('name');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      root: el.closest('main'),
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: async () => {
      const { data } = await vendorsApi.getAll();
      return data;
    },
    enabled: user?.role !== 'SUPPLIER',
  });

  const createMutation = useMutation({
    mutationFn: (data: VendorPayload) => vendorsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Tedarikçi başarıyla eklendi');
      setIsFormOpen(false);
    },
    onError: (err: unknown) =>
      toast.error((err as any)?.response?.data?.message || 'Tedarikçi eklenemedi'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: VendorPayload }) =>
      vendorsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Tedarikçi güncellendi');
      setIsFormOpen(false);
      setEditingVendor(null);
    },
    onError: (err: unknown) =>
      toast.error((err as any)?.response?.data?.message || 'Tedarikçi güncellenemedi'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vendorsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Tedarikçi silindi');
    },
    onError: () => toast.error('Tedarikçi silinemedi'),
  });

  const tagMutation = useMutation({
    mutationFn: ({ id, categories }: { id: string; categories: string[] }) =>
      vendorsApi.update(id, { categories }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setTagEditFor(null);
      setTagDraft('');
    },
    onError: (err: unknown) =>
      toast.error((err as any)?.response?.data?.message || 'Etiket kaydedilemedi'),
  });

  const cityOptions = useMemo(() => {
    const used = new Set(vendors.map((v) => v.city).filter(Boolean) as string[]);
    return Array.from(used).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [vendors]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const vendor of vendors) {
      for (const category of vendor.categories || []) {
        counts.set(category, (counts.get(category) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
  }, [vendors]);

  const untaggedCount = useMemo(
    () => vendors.filter((v) => (v.categories || []).length === 0).length,
    [vendors],
  );

  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const vendor of vendors) {
      const parts: unknown[] = [
        vendor.name,
        vendor.contactName,
        vendor.contactEmail,
        ...(vendor.extraContactEmails || []),
        vendor.contactPhone,
        ...(vendor.extraContactPhones || []),
        vendor.taxId,
        vendor.city,
        vendor.district,
        vendor.address,
        ...(vendor.categories || []),
        vendor.notes,
      ];
      for (const contact of vendor.contacts || []) {
        parts.push(contact.name, contact.title, contact.email, contact.phone, contact.notes);
      }
      // Numara boşluklu da kayıtlı olabiliyor: "0532 528 58 61" ve "05325285861" ikisi de bulunsun
      for (const phone of [
        vendor.contactPhone,
        ...(vendor.extraContactPhones || []),
        ...(vendor.contacts || []).map((c) => c.phone),
      ]) {
        if (phone) parts.push(String(phone).replace(/\D/g, ''));
      }
      index.set(vendor.id, fold(parts.filter(Boolean).join(' ')));
    }
    return index;
  }, [vendors]);

  const filtered = useMemo(() => {
    const terms = fold(searchTerm).split(/\s+/).filter(Boolean);
    const activeFolded = activeCategories.map((c) => fold(c));

    return vendors.filter((vendor) => {
      if (cityFilter && vendor.city !== cityFilter) return false;
      if (onlyUntagged && (vendor.categories || []).length > 0) return false;
      if (onlyNoEmail && vendor.contactEmail) return false;
      if (activeFolded.length) {
        const tags = (vendor.categories || []).map((c) => fold(c));
        if (!activeFolded.some((tag) => tags.includes(tag))) return false;
      }
      if (terms.length) {
        const haystack = searchIndex.get(vendor.id) || '';
        if (!terms.every((term) => haystack.includes(term))) return false;
      }
      return true;
    });
  }, [vendors, searchIndex, searchTerm, cityFilter, activeCategories, onlyUntagged, onlyNoEmail]);

  const noEmailCount = useMemo(() => vendors.filter((v) => !v.contactEmail).length, [vendors]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        sortKey === 'new'
          ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          : a.name.localeCompare(b.name, 'tr'),
      ),
    [filtered, sortKey],
  );

  const saveTags = (vendor: Vendor) => {
    const incoming = tagDraft
      .split(',')
      .map((t) => t.replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR'))
      .filter(Boolean);
    if (!incoming.length) {
      setTagEditFor(null);
      setTagDraft('');
      return;
    }
    const existing = vendor.categories || [];
    const seen = new Set(existing.map((c) => fold(c)));
    const merged = [...existing];
    for (const tag of incoming) {
      if (seen.has(fold(tag))) continue;
      seen.add(fold(tag));
      merged.push(tag);
    }
    tagMutation.mutate({ id: vendor.id, categories: merged });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSave = (data: VendorPayload) => {
    if (editingVendor) {
      updateMutation.mutate({ id: editingVendor.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setIsFormOpen(true);
  };

  const openCreate = () => {
    setEditingVendor(null);
    setIsFormOpen(true);
  };

  // Role guard — AFTER all hooks
  if (user?.role === 'SUPPLIER') {
    router.push('/dashboard');
    return null;
  }

  const filtersActive =
    activeCategories.length > 0 || onlyUntagged || onlyNoEmail || Boolean(cityFilter || searchTerm);
  const resetFilters = () => {
    setActiveCategories([]);
    setOnlyUntagged(false);
    setOnlyNoEmail(false);
    setCityFilter('');
    setSearchTerm('');
  };
  const toggleCategory = (category: string) =>
    setActiveCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );

  const sheetVendor = vendors.find((v) => v.id === selectedId) ?? null;
  const openVendor = (id: string) => {
    setSelectedId(id);
    setTagEditFor(null);
  };
  const closeSheet = () => setSelectedId(null);

  const people = sheetVendor ? vendorToPeople(sheetVendor).filter((p) => p.name || p.phone || p.email) : [];
  const primaryPhone = people.find((p) => p.phone)?.phone || sheetVendor?.contactPhone;
  const primaryEmail = sheetVendor?.contactEmail || people.find((p) => p.email)?.email;

  return (
    <div className="mx-auto w-full max-w-[1600px] pb-10">
      <VendorFormDialog
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingVendor(null);
        }}
        editingVendor={editingVendor}
        onSave={handleSave}
        isPending={isPending}
        categorySuggestions={categoryCounts.map(([category]) => category)}
        canChooseModule={user?.role === 'ADMIN'}
      />

      <PageHeader
        tour="vendors-head"
        title="Tedarikçi listesi"
        description="Sistem dışı tedarikçi firmaların iletişim bilgileri ve ne sattıkları."
        actions={
          <PrimaryButton icon={<Plus className="size-[18px]" strokeWidth={1.9} />} onClick={openCreate}>
            Yeni tedarikçi
          </PrimaryButton>
        }
      />

      {/* Özet: okunur bir cümle, altında kutusuz üç sütun; her sütun basınca süzgeç olur. Arkada marka dokusu. */}
      <Tile tour="vendors-filters" className="texture-host mb-4 p-5 sm:p-7">
        <span aria-hidden className="tile-texture" />
        <span aria-hidden className="tile-texture tile-texture-bottom" />
        <div className="relative">
          <p className="text-[12.5px] font-medium text-white/45">Rehber</p>
          <h2 className="mt-2 max-w-[760px] text-[24px] font-[300] leading-[1.2] tracking-[-0.025em] text-white/55 sm:text-[30px]">
            {isLoading ? (
              'Tedarikçiler yükleniyor…'
            ) : (
              <>
                <span className="text-white">{vendors.length.toLocaleString('tr-TR')} tedarikçi</span>
                {cityOptions.length ? (
                  <>
                    , <span className="text-white">{cityOptions.length.toLocaleString('tr-TR')} şehirde</span>
                  </>
                ) : null}
                .
              </>
            )}
          </h2>
          <p className="mt-2.5 text-[13.5px] text-white/40">
            {categoryCounts.length
              ? `${categoryCounts.length.toLocaleString('tr-TR')} farklı üründe teklif isteyebilirsiniz.`
              : 'Firmalara ne sattıklarını etiketleyince burada görünür.'}
          </p>

          <div className="mt-8 grid grid-cols-1 divide-y divide-white/[0.06] md:grid-cols-3 md:divide-x md:divide-y-0">
            <SummaryFilter
              edge="start"
              icon={<MailX className="text-[#f2a93b]" strokeWidth={1.8} />}
              label="E-postası yok"
              value={noEmailCount}
              sub="Teklif maili gitmez; firmaya SMS ile ulaşılır."
              active={onlyNoEmail}
              onClick={() => setOnlyNoEmail((v) => !v)}
            />
            <SummaryFilter
              icon={<Tag className="text-white/45" strokeWidth={1.8} />}
              label="Etiketsiz"
              value={untaggedCount}
              sub="Ne sattığı girilmemiş; ürün aramasında çıkmaz."
              active={onlyUntagged}
              onClick={() => setOnlyUntagged((v) => !v)}
            />
            <div className="min-w-0 pt-5 md:pl-7 md:pt-0">
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-white/40">
                <PackageSearch className="size-[15px] text-white/45" strokeWidth={1.8} />
                En çok satılanlar
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {categoryCounts.slice(0, 6).map(([category, count]) => {
                  const on = activeCategories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCategory(category)}
                      className={cn(
                        'press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40',
                        on
                          ? 'border-brand bg-brand text-primary-foreground'
                          : 'border-white/[0.08] text-white/70 hover:border-brand hover:bg-brand hover:text-primary-foreground',
                      )}
                    >
                      <span className="max-w-[140px] truncate">{category}</span>
                      <span className="tabular-nums opacity-55">{count}</span>
                    </button>
                  );
                })}
                {!categoryCounts.length ? <span className="text-[13px] text-white/35">Henüz etiket yok.</span> : null}
              </div>
            </div>
          </div>
        </div>
      </Tile>

      {/* Araç çubuğu geniş ekranda yapışır: kartlarda gezerken arama ve süzgeçler elinin altında kalır. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div
        className={cn(
          '-mx-2 -mt-2 mb-1 flex flex-col gap-2 rounded-b-[20px] px-2 py-2 transition-[background-color,box-shadow] duration-300 lg:sticky lg:top-0 lg:z-20 lg:flex-row lg:items-center',
          stuck && 'lg:bg-[#141416]/80 lg:shadow-[0_14px_32px_-18px_rgba(0,0,0,0.9)] lg:backdrop-blur-xl',
        )}
      >
        <SearchField
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Firma, ürün, yetkili, telefon ara"
          label="Tedarikçi ara"
          className="lg:flex-1"
        />
        <SelectMenu
          label="Şehir"
          value={cityFilter}
          onChange={setCityFilter}
          active={Boolean(cityFilter)}
          searchable
          className="lg:w-52"
          options={[
            { value: '', label: 'Tüm şehirler' },
            ...cityOptions.map((c) => ({
              value: c,
              label: c,
              hint: String(vendors.filter((v) => v.city === c).length),
            })),
          ]}
        />
        <SelectMenu
          label="Ne satıyor"
          value={activeCategories.length === 1 ? activeCategories[0] : activeCategories.length > 1 ? '__many' : ''}
          onChange={(next) => setActiveCategories(next && next !== '__many' ? [next] : [])}
          active={activeCategories.length > 0}
          searchable
          menuWidth={280}
          className="lg:w-56"
          options={[
            { value: '', label: 'Tüm ürünler' },
            ...(activeCategories.length > 1
              ? [{ value: '__many', label: `${activeCategories.length} ürün seçili` }]
              : []),
            ...categoryCounts.map(([category, count]) => ({ value: category, label: category, hint: String(count) })),
          ]}
        />
        <SelectMenu
          label="Sırala"
          value={sortKey}
          onChange={(v) => setSortKey(v === 'new' ? 'new' : 'name')}
          align="end"
          className="lg:w-44"
          options={[
            { value: 'name', label: 'Ada göre (A–Z)' },
            { value: 'new', label: 'Yeni eklenen' },
          ]}
        />
      </div>

      <div className="mb-3 flex min-h-8 items-center justify-between px-1 text-[12.5px] text-white/40">
        <span className="tabular-nums">{filtered.length.toLocaleString('tr-TR')} firma</span>
        {filtersActive ? (
          <button
            type="button"
            onClick={resetFilters}
            className="press h-8 rounded-full px-3 font-medium text-white/60 outline-none transition-colors duration-150 hover:bg-brand hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Süzgeçleri temizle
          </button>
        ) : null}
      </div>

      <Swap
        loading={isLoading}
        skeleton={<SkeletonCards count={8} className="gap-3 2xl:grid-cols-4" />}
      >
        {sorted.length === 0 ? (
          <Tile>
            <EmptyState
              icon={<Building2 />}
              title={filtersActive ? 'Eşleşen tedarikçi yok' : 'Henüz tedarikçi yok'}
              body={filtersActive ? 'Aramayı veya süzgeçleri değiştirip yeniden deneyin.' : 'Eklediğiniz firmalar burada listelenir.'}
            />
          </Tile>
        ) : (
          <div data-tour="vendors-list" className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sorted.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} onOpen={() => openVendor(vendor.id)} />
            ))}
          </div>
        )}
      </Swap>

      {/* Firma kartı: sağdan kayarak açılan sayfa; karartmaya, çarpıya ya da Esc'e basınca aynı yoldan kapanır. */}
      {sheetVendor ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={sheetVendor.name}>
          <button
            type="button"
            aria-label="Kartı kapat"
            onClick={closeSheet}
            className="sheet-scrim absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
          />
          <aside className="sheet-panel absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col overflow-hidden bg-[#161618] shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.9)] sm:inset-y-3 sm:right-3 sm:rounded-[24px] sm:border sm:border-white/[0.08]">
            <div className="texture-host relative shrink-0 overflow-hidden px-6 pb-6 pt-4">
              <span aria-hidden className="tile-texture" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(217,182,37,0.1),transparent_80%)]"
              />
              <div className="relative flex justify-end">
                <IconButton label="Kapat" onClick={closeSheet}>
                  <X className="size-4" />
                </IconButton>
              </div>
              <div className="relative flex flex-col items-center text-center">
                <span className="flex size-20 items-center justify-center rounded-full bg-[linear-gradient(160deg,#e9cc4f,#b8961c)] text-[32px] font-medium text-[#141416] shadow-[0_12px_32px_-12px_rgba(217,182,37,0.55)]">
                  {sheetVendor.name.trim().charAt(0).toLocaleUpperCase('tr-TR')}
                </span>
                <h2 className="mt-4 max-w-[28ch] text-[22px] font-medium leading-tight tracking-[-0.025em] text-white">
                  {sheetVendor.name}
                </h2>
                <p className="mt-1.5 max-w-[44ch] text-[13px] text-white/50">
                  {[sheetVendor.city, (sheetVendor.categories || []).slice(0, 3).join(', ')].filter(Boolean).join(' · ') ||
                    'Ne sattığı girilmemiş'}
                </p>
              </div>
              <div className="relative mx-auto mt-6 grid max-w-[400px] grid-cols-4 gap-2">
                <QuickAction
                  icon={Phone}
                  label="Ara"
                  href={primaryPhone ? `tel:${String(primaryPhone).replace(/\s/g, '')}` : undefined}
                />
                <QuickAction icon={Mail} label="E-posta" href={primaryEmail ? `mailto:${primaryEmail}` : undefined} />
                <QuickAction
                  icon={PackageSearch}
                  label="Katalog"
                  onClick={() => router.push(`/vendors/${sheetVendor.id}/products`)}
                />
                <QuickAction icon={Pencil} label="Düzenle" onClick={() => openEdit(sheetVendor)} />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-8 pt-2 [scrollbar-width:thin]">
              {!sheetVendor.contactEmail ? (
                <div className="flex items-start gap-3 rounded-[16px] border border-[#f2a93b]/25 bg-[#f2a93b]/[0.07] px-4 py-3.5">
                  <MailX className="mt-0.5 size-4 shrink-0 text-[#f2a93b]" />
                  <p className="text-[13px] leading-relaxed text-white/75">
                    E-posta yok: teklif maili gönderilemez, firmaya SMS ile ulaşılır.
                  </p>
                </div>
              ) : null}

              <Group title="İletişim" aside={people.length ? `${people.length} kişi` : undefined}>
                {people.length ? (
                  people.map((person, i) => (
                    <div key={person.id || `${person.email}-${person.phone}-${i}`} className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 truncate text-[14.5px] font-medium text-white">{person.name || 'Adı girilmemiş'}</p>
                        {i === 0 ? (
                          <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand-ink">
                            Birincil
                          </span>
                        ) : null}
                        {person.title ? <span className="truncate text-[12.5px] text-white/40">{person.title}</span> : null}
                      </div>
                      <div className="mt-2 space-y-1">
                        {person.phone ? (
                          <InfoLink
                            label="telefon"
                            href={`tel:${String(person.phone).replace(/\s/g, '')}`}
                            value={maskTrPhoneLoose(person.phone)}
                          />
                        ) : null}
                        {person.email ? <InfoLink label="e-posta" href={`mailto:${person.email}`} value={person.email} /> : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-4 py-3.5 text-[13.5px] text-white/40">Yetkili kişi girilmemiş.</p>
                )}
              </Group>

              <Group title="Ne satıyor">
                <div className="flex flex-wrap items-center gap-1.5 px-4 py-3.5">
                  {(sheetVendor.categories || []).map((category) => (
                    <span key={category} className="rounded-full bg-white/[0.06] px-3 py-1 text-[12.5px] font-medium text-white/80">
                      {category}
                    </span>
                  ))}
                  {tagEditFor === sheetVendor.id ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveTags(sheetVendor);
                          }
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setTagEditFor(null);
                            setTagDraft('');
                          }
                        }}
                        placeholder="motor, redüktör"
                        aria-label="Etiket ekle"
                        className={cn(fieldClass, 'h-8 w-44 rounded-full px-3 text-[12.5px] focus:ring-2')}
                      />
                      <button
                        type="button"
                        disabled={tagMutation.isPending}
                        onClick={() => saveTags(sheetVendor)}
                        className="press flex h-8 items-center rounded-full bg-brand px-3 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-[#e4c43c] disabled:opacity-50"
                      >
                        {tagMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : 'Ekle'}
                      </button>
                      <IconButton
                        label="Vazgeç"
                        onClick={() => {
                          setTagEditFor(null);
                          setTagDraft('');
                        }}
                      >
                        <X className="size-4" />
                      </IconButton>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTagEditFor(sheetVendor.id);
                        setTagDraft('');
                      }}
                      className="press flex h-7 items-center gap-1 rounded-full border border-dashed border-white/[0.16] px-3 text-[12.5px] font-medium text-white/55 transition-colors duration-150 hover:border-brand hover:bg-brand hover:text-primary-foreground"
                    >
                      <Plus className="size-3.5" />
                      Etiket ekle
                    </button>
                  )}
                </div>
              </Group>

              <Group title="Firma">
                <InfoRow label="Vergi no" value={sheetVendor.taxId || '—'} mono />
                <InfoRow
                  label="Konum"
                  value={sheetVendor.city ? `${sheetVendor.district || 'Merkez'}, ${sheetVendor.city}` : '—'}
                />
                {sheetVendor.address ? <InfoRow label="Adres" value={sheetVendor.address} /> : null}
                <InfoRow label="Eklenme" value={format(new Date(sheetVendor.createdAt), 'd MMMM yyyy', { locale: tr })} />
              </Group>

              {sheetVendor.notes ? (
                <Group title="Not">
                  <p className="whitespace-pre-wrap px-4 py-3.5 text-[14px] leading-relaxed text-white/75">{sheetVendor.notes}</p>
                </Group>
              ) : null}

              <div className="overflow-hidden rounded-[16px] border border-white/[0.06] bg-white/[0.025]">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`"${sheetVendor.name}" firmasını silmek istediğinize emin misiniz?`)) {
                      deleteMutation.mutate(sheetVendor.id);
                      closeSheet();
                    }
                  }}
                  className="flex h-12 w-full items-center justify-center gap-2 text-[14px] font-medium text-[#f2705e] transition-colors duration-150 hover:bg-destructive hover:text-white"
                >
                  <Trash2 className="size-4" />
                  Tedarikçiyi sil
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

/** Özet sütunu: soluk etiket, altında sayı cümlesi; basınca süzgeç olur, seçiliyken sayı altına döner. */
function SummaryFilter({
  icon,
  label,
  value,
  sub,
  active,
  onClick,
  edge,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  active: boolean;
  onClick: () => void;
  edge?: 'start';
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'group/sf min-w-0 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40 md:px-7 md:py-0',
        edge === 'start' && 'pt-0 md:pl-0',
      )}
    >
      <span className="flex items-center gap-2 text-[12.5px] font-medium text-white/40 [&_svg]:size-[15px]">
        {icon}
        {label}
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-[11px] transition-colors duration-150 md:ml-1',
            active ? 'bg-brand text-primary-foreground' : 'text-transparent group-hover/sf:text-white/40',
          )}
        >
          {active ? 'Süzülüyor' : 'Süz'}
        </span>
      </span>
      <span className="mt-3 block text-[17px] leading-[1.35] text-white/50">
        <b
          className={cn(
            'font-medium transition-colors duration-200',
            active ? 'text-brand-ink' : 'text-white group-hover/sf:text-brand-ink',
          )}
        >
          {value.toLocaleString('tr-TR')} firma
        </b>
      </span>
      <span className="mt-1.5 block text-[12.5px] text-white/40">{sub}</span>
    </button>
  );
}

/**
 * Firma kartı (pano kutuları gibi): üzerine gelince alttan altın dolgu yükselir, kart hafifçe kalkar, baş harf
 * kutusu alttan dolar, alt çizgi soldan uzanır ve köşede ok belirir. Basınca firma sayfası sağdan açılır.
 */
function VendorCard({ vendor, onOpen }: { vendor: Vendor; onOpen: () => void }) {
  const lead = vendorToPeople(vendor).find((p) => p.name || p.phone);
  const phone = lead?.phone || vendor.contactPhone;
  const categories = vendor.categories || [];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="gold-fade group/card relative flex min-h-[184px] flex-col rounded-[20px] border border-white/[0.07] bg-card p-5 text-left outline-none transition-[border-color,transform] duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] hover:-translate-y-0.5 hover:border-white/[0.14] focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.99] active:duration-100"
    >
      <span
        aria-hidden
        className="absolute inset-x-5 bottom-0 h-[2px] origin-left scale-x-0 rounded-full bg-brand transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:scale-x-100"
      />
      <span className="flex items-start gap-3">
        <InitialTile name={vendor.name} groupClass="group-hover/card:scale-y-100" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] font-medium leading-snug tracking-[-0.01em] text-white">
            {vendor.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-white/40">
            <MapPin className="size-3 shrink-0" />
            {vendor.city ? [vendor.district, vendor.city].filter(Boolean).join(', ') : 'Konum girilmemiş'}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 -translate-x-1.5 -rotate-45 text-brand opacity-0 transition-[opacity,transform] duration-300 group-hover/card:translate-x-0 group-hover/card:opacity-100" />
      </span>

      <span className="mt-4 flex flex-wrap gap-1.5">
        {categories.slice(0, 3).map((category) => (
          <span key={category} className="max-w-[150px] truncate rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] text-white/70">
            {category}
          </span>
        ))}
        {categories.length > 3 ? (
          <span className="px-1 py-1 text-[11.5px] tabular-nums text-white/35">+{categories.length - 3}</span>
        ) : null}
        {!categories.length ? <span className="text-[12px] text-white/30">Ne sattığı girilmemiş</span> : null}
      </span>

      <span className="mt-auto flex items-center gap-3 pt-4 text-[12.5px]">
        <span className="min-w-0 flex-1 truncate text-white/55">
          {lead?.name || vendor.contactName || 'Yetkili girilmemiş'}
          {phone ? <span className="tabular-nums text-white/35"> · {maskTrPhoneLoose(phone)}</span> : null}
        </span>
        {vendor.contactEmail ? (
          <Mail aria-label="E-postası var" className="size-3.5 shrink-0 text-white/30" />
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-[#f2a93b]">
            <MailX className="size-3.5" />
            E-posta yok
          </span>
        )}
      </span>
    </button>
  );
}

/** Kişi kartındaki yuvarlak hızlı eylem; bağlantı yoksa soluk ve pasif. */
function QuickAction({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const disabled = !href && !onClick;
  const inner = (
    <>
      <span className="flex size-12 items-center justify-center rounded-full bg-white/[0.06] text-brand transition-[background-color,color,transform] duration-200 group-hover/qa:bg-brand group-hover/qa:text-primary-foreground group-active/qa:scale-95">
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <span className="text-[12px] font-medium text-white/60 transition-colors group-hover/qa:text-white">{label}</span>
    </>
  );
  const cls = cn(
    'group/qa flex flex-col items-center gap-2 rounded-[14px] py-2 outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
    disabled && 'pointer-events-none opacity-35',
  );
  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/** HIG gruplu liste: üstte küçük başlık, altında yuvarlak köşeli kutu, satırlar arası iç çizgi. */
function Group({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h3 className="text-[13px] font-medium text-white/50">{title}</h3>
        {aside ? <span className="text-[12px] tabular-nums text-white/35">{aside}</span> : null}
      </div>
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-[16px] border border-white/[0.06] bg-white/[0.025]">
        {children}
      </div>
    </section>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <span className="w-20 shrink-0 pt-px text-[12.5px] text-white/45">{label}</span>
      <span className={cn('min-w-0 flex-1 text-[14px] text-white/85', mono && 'tabular-nums')}>{value}</span>
    </div>
  );
}

/** Kişi kartı bağlantısı: solda küçük etiket, sağda altın değer; üzerine gelince altın dolar. */
function InfoLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <a
      href={href}
      className="group/il -mx-2 flex items-center gap-4 rounded-[10px] px-2 py-1.5 transition-colors duration-150 hover:bg-brand"
    >
      <span className="w-[4.5rem] shrink-0 text-[12.5px] text-white/45 group-hover/il:text-primary-foreground/60">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] tabular-nums text-brand-ink group-hover/il:text-primary-foreground">{value}</span>
    </a>
  );
}
