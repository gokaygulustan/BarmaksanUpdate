import { isSatinAlmaPurchasing } from '@/lib/access';

export type TourPersona =
  | 'admin'
  | 'sa-manager'
  | 'sa-staff'
  | 'production-manager'
  | 'production-staff'
  | 'supplier'
  | 'department';

export type TourPageId =
  | 'dashboard'
  | 'taleplerim'
  | 'taleplerim-yeni'
  | 'internal-requests'
  | 'procurement'
  | 'procurement-new'
  | 'procurement-new-send'
  | 'procurement-detail'
  | 'vendors'
  | 'analysis-reports';

export type TourReveal = 'rfq-preview-columns' | 'rfq-preview-managers' | 'rfq-preview-email';

export type TourStep = {
  selector?: string;
  title: string;
  body: string;
  /** Gönderim sihirbazında görünmeyen adımı ekrana getirir. */
  reveal?: TourReveal;
};

export type TourDef = {
  id: string;
  steps: TourStep[];
};

const LS = 'up-tour-v1';

export function tourPersona(user: {
  role?: string;
  moduleId?: string;
  subRole?: string;
  isExecutive?: boolean;
} | null | undefined): TourPersona | null {
  if (!user?.role) return null;
  if (user.role === 'SUPPLIER') return 'supplier';
  if (user.role === 'DEPARTMENT') return 'department';
  if (user.role === 'ADMIN' || user.isExecutive) return 'admin';
  if (isSatinAlmaPurchasing(user)) {
    return user.subRole === 'MANAGER' ? 'sa-manager' : 'sa-staff';
  }
  return user.subRole === 'MANAGER' ? 'production-manager' : 'production-staff';
}

export function tourIdForPath(pathname: string): TourPageId | null {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname === '/taleplerim') return 'taleplerim';
  if (pathname === '/taleplerim/yeni') return 'taleplerim-yeni';
  if (pathname === '/internal-requests') return 'internal-requests';
  if (pathname === '/procurement') return 'procurement';
  if (pathname === '/procurement/new') return 'procurement-new';
  if (pathname === '/vendors') return 'vendors';
  if (pathname === '/analysis-reports') return 'analysis-reports';
  if (pathname === '/procurement/central') return null; // talep detayı değil: merkezi takip listesi
  if (/^\/procurement\/[^/]+$/.test(pathname)) return 'procurement-detail';
  return null;
}

export function tourStorageKey(userId: string, tourId: string) {
  return `${LS}:${userId}:${tourId}`;
}

export function isTourCompleted(userId: string, tourId: string) {
  try {
    return localStorage.getItem(tourStorageKey(userId, tourId)) === '1';
  } catch {
    return false;
  }
}

export function markTourCompleted(userId: string, tourId: string) {
  try {
    localStorage.setItem(tourStorageKey(userId, tourId), '1');
  } catch {
    /* ignore quota / private mode */
  }
}

export function requestTourReplay() {
  window.dispatchEvent(new CustomEvent('up-tour:start'));
}

export function requestNamedTour(pageId: TourPageId) {
  window.dispatchEvent(new CustomEvent('up-tour:start-named', { detail: { pageId } }));
}

export function prepareTourChrome(sidebar: boolean) {
  window.dispatchEvent(new CustomEvent('up-tour:prepare', { detail: { sidebar } }));
}

const step = (selector: string, title: string, body: string): TourStep => ({ selector, title, body });
const intro = (title: string, body: string): TourStep => ({ title, body });
const reveal = (selector: string, which: TourReveal, title: string, body: string): TourStep => ({
  selector,
  reveal: which,
  title,
  body,
});

function dashboardSteps(persona: TourPersona): TourStep[] {
  if (persona === 'department') return [];

  if (persona === 'supplier') {
    return [
      intro(
        'Teklif panelinize hoş geldiniz',
        'Size fiyat sorulan listeler burada özetlenir. Teklif vermek için ilgili kayda girersiniz; birim talebi veya satın alma panosu sizin ekranınızda yoktur.'
      ),
      step('dash-hero', 'Hızlı giriş', 'Bekleyen işiniz varsa buradaki düğmeyle doğrudan teklif listenize gidersiniz.'),
      step('dash-stats', 'Özet sayılar', 'Kaç listenin cevap beklediğini buradan görürsünüz. Kartlara tıklayınca ilgili liste açılır.'),
      step('dash-agenda', 'Bugün ne var?', 'Cevap bekleyen veya yeni iletilen talepler burada toplanır.'),
      step('dash-recent', 'Son talepler', 'Firmanıza gelen son teklif istekleri. Bir satıra tıklayınca detaya gidersiniz.'),
      step('nav-procurement', 'Teklif Verme', 'Sol menüdeki bu kayıt, size iletilen tüm teklif taleplerinin listesidir.'),
      step('tour-help', 'Turu tekrar izleyin', 'Takıldığınız sayfada üstteki soru işaretine basarak bu turu yeniden açabilirsiniz. Atladığınızda bir daha kendiliğinden çıkmaz.'),
    ];
  }

  if (persona === 'sa-staff') {
    return [
      intro(
        'Satın alma personeli paneli',
        'Siz tedarikçiye doğrudan fiyat sormazsınız. Birimlerden gelen işleri görür, kalem hazırlar ve yetkiliye iletirsiniz. “Yeni tedarikçi talebi” ile “birim talebi” karışmasın diye tur bunu ayırır.'
      ),
      step('dash-hero', 'Bugünkü işiniz', 'Karşılama kartı sizin rolünüze göre yazılır. Altındaki düğme sizi yetkiliye gidecek forma veya birim kuyruğuna götürür.'),
      step('dash-stats', 'Özet kartlar', 'Bekleyen birim talebi ve sizin hazırladığınız kayıtlar burada. Sayıya tıklayınca ilgili sayfa açılır.'),
      step('dash-shortcuts', 'Kısayollar', 'En sık kullandığınız ekranlar. “Yetkiliye talep” tedarikçiye mail atmaz; birim kuyruğu da tedarikçi listesi değildir.'),
      step('dash-agenda', 'Sıradaki iş', 'Yetkili onayı bekleyen veya sizin dokunmanız gereken kayıtlar burada durur.'),
      step('dash-recent', 'Son tedarikçi talepleri', 'Tedarikçiye gitmiş listeler. Birimlerden gelen ham talepler burada değil, “Birim tedarik talepleri”ndedir.'),
      step('nav-dashboard', 'Tedarik paneli', 'Özet buradadır. İş yapmak için soldaki diğer menülere geçersiniz.'),
      step(
        'nav-procurement-new',
        'Yetkiliye talep',
        'Kalemleri buradan yazarsınız. Kayıt yetkiliye gider; tedarikçiye e-posta gitmez. Tedarikçiye göndermek yetkilinin işidir.'
      ),
      step(
        'nav-internal',
        'Birim tedarik talepleri',
        'Fabrika / birimlerin yazdığı taleplerin kuyruğu. Onay ve reddetme yetkiliye aittir; siz hazırlık ve takibi görürsünüz.'
      ),
      step(
        'nav-procurement',
        'Tedarikçi talepleri',
        'Tedarikçilere fiyat sorulmuş listeler. Birim talebi açmak veya yetkiliye iç talep yazmak buradan yapılmaz.'
      ),
      step('tour-help', 'Turu tekrar izleyin', 'Her sayfanın kendi turu vardır. Üstteki soru işareti o sayfayı yeniden anlatır.'),
    ];
  }

  if (persona === 'sa-manager') {
    return [
      intro(
        'Satın alma yetkilisi paneli',
        'Birim taleplerini inceler, onaylar ve tedarikçiye fiyat sorarsınız. “Taleplerim” sizin kişisel kaydınız; “Birim tedarik talepleri” herkesin kuyruğu; “Tedarikçi talepleri” firmalara giden listedir.'
      ),
      step('dash-hero', 'Karşılama ve hızlı iş', 'Günün asıl işi buradaki düğmelerle başlar: kuyruk veya yeni tedarikçi talebi.'),
      step('dash-stats', 'Özet kartlar', 'Bekleyen onay, tedarikçi cevabı ve taslaklar. Karta basınca ilgili listeye gidersiniz.'),
      step('dash-shortcuts', 'Kısayollar', 'Birim kuyruğu, tedarikçi listesi ve yeni RFQ ayrı yerlerdedir; karıştırmamak için buradan seçin.'),
      step('dash-agenda', 'Sıradaki iş', 'Onayınızı bekleyen birim talepleri ve cevap gelmiş teklifler burada öne çıkar.'),
      step('dash-recent', 'Son tedarikçi talepleri', 'Firmalara gitmiş kayıtlar. Birimlerden henüz onaylanmamış iş bu listede olmaz.'),
      step('nav-dashboard', 'Tedarik paneli', 'Sayılar ve kısayollar. Ayrıntılı iş sol menüdeki sayfalarda yapılır.'),
      step(
        'nav-procurement-new',
        'Tedarikçi talebi oluştur',
        'Seçtiğiniz firmalara e-posta ile fiyat sorarsınız. Birim içi talep yazmak için “Yeni birim talebi” / Taleplerim kullanılır.'
      ),
      step(
        'nav-internal',
        'Birim tedarik talepleri',
        'Birimlerin gönderdiği işler. İnceler, reddeder veya onaylayıp tedarikçi talebine çevirirsiniz. Personelin “yetkiliye talep”leri de buraya düşer.'
      ),
      step(
        'nav-procurement',
        'Tedarikçi talepleri',
        'Tedarikçilere iletilmiş / taslak RFQ’lar. Teklif, karşılaştırma ve sipariş buradaki kayıtlardan yürür.'
      ),
      step('tour-help', 'Turu tekrar izleyin', 'Takıldığınızda üstteki soru işareti bu sayfanın turunu yeniden açar.'),
    ];
  }

  if (persona === 'production-staff' || persona === 'production-manager') {
    const yetkili = persona === 'production-manager';
    return [
      intro(
        yetkili ? 'Üretim planlama yetkilisi paneli' : 'Üretim planlama paneli',
        'Sizin ana işiniz tedarikçiye fiyat sormaktır. “Taleplerim” kendi birim taleplerinizdir; “Tedarikçi talepleri” firmalara giden listelerdir. Satın alma biriminin kuyruğu bu ekranda yoktur.'
      ),
      step('dash-hero', 'Karşılama', 'Hızlı düğme sizi yeni tedarikçi talebine veya listenize götürür.'),
      step('dash-stats', 'Özet kartlar', 'Taslak, tedarikçide ve cevap gelmiş listelerin sayısı.'),
      step('dash-shortcuts', 'Kısayollar', 'Yeni talep, açık listeler ve analiz (modülünüzde varsa) buradan açılır.'),
      step('dash-agenda', 'Sıradaki iş', 'Cevap bekleyen veya taslak kalan işler burada toplanır.'),
      step('dash-recent', 'Son tedarikçi talepleri', 'Oluşturduğunuz veya gördüğünüz son RFQ kayıtları.'),
      step('nav-dashboard', 'Tedarik paneli', 'Özet buradadır. İş, sol menüdeki “Tedarikçi talebi oluştur” ve listeden yürür.'),
      step(
        'nav-procurement-new',
        'Tedarikçi talebi oluştur',
        'Kalem + tedarikçi seçip e-posta ile fiyat sorarsınız. Bu, birim içi “Taleplerim / Yeni talep” formu değildir.'
      ),
      step(
        'nav-taleplerim',
        'Benim taleplerim',
        'Satın alma birimine ilettiğiniz kişisel talepler. Tedarikçiye giden listeler “Tedarikçi talepleri”ndedir.'
      ),
      step(
        'nav-procurement',
        'Tedarikçi talepleri',
        'Firmalara sorulmuş bütün listeler, durumları ve teklifleri.'
      ),
      step('tour-help', 'Turu tekrar izleyin', 'Üstteki soru işareti bulunduğunuz sayfanın turunu yeniden başlatır.'),
    ];
  }

  return [
    intro(
      'Yönetim paneline hoş geldiniz',
      'Sistem yöneticisi olarak birim kuyruğu, tedarikçi talepleri, firmalar ve ayarlar sizin elinizdedir. Aşağıdaki tur, en çok karıştırılan sayfaları ayırır.'
    ),
    step('dash-hero', 'Karşılama', 'Rolünüze göre özet ve hızlı işlem düğmeleri. İşe buradan başlayabilirsiniz.'),
    step('dash-stats', 'Özet kartlar', 'Bekleyen onay, tedarikçi cevabı ve taslak sayıları. Karta tıklayınca ilgili liste açılır.'),
    step('dash-shortcuts', 'Kısayollar', 'Sık kullanılan ekranlar. Birim talebi, tedarikçi RFQ’su ve ayarlar ayrı kısayollardır.'),
    step('dash-agenda', 'Sıradaki iş', 'Bugün bakmanız gereken onay ve teklif işleri burada durur.'),
    step('dash-recent', 'Son tedarikçi talepleri', 'Firmalara gitmiş son kayıtlar. Birim kuyruğu bu blokta değildir.'),
    step('nav-dashboard', 'Tedarik paneli', 'Genel bakış. Detay işler sol menüdeki sayfalarda yapılır.'),
    step(
      'nav-procurement-new',
      'Tedarikçi talebi oluştur',
      'Firmalara fiyat sormak için. Birimlerin yazdığı iç talepler “Birim tedarik talepleri”ndedir.'
    ),
    step(
      'nav-internal',
      'Birim tedarik talepleri',
      'Birim kullanıcılarının ve satın alma personelinin yetkiliye ilettiği kuyruk. Onay / red burada.'
    ),
    step(
      'nav-procurement',
      'Tedarikçi talepleri',
      'Tedarikçilere iletilmiş RFQ listesi. Teklif, analiz ve sipariş bu kayıtlardan yürür.'
    ),
    step('nav-vendors-group', 'Tedarikçi işlemleri', 'Firma kartları ve cari geçmiş. Yeni talep açmak için değil, cari yönetimi için.'),
    step('tour-help', 'Turu tekrar izleyin', 'İstediğiniz sayfada soru işaretine basarak turu yeniden açabilirsiniz.'),
  ];
}

function taleplerimSteps(persona: TourPersona): TourStep[] {
  if (persona === 'supplier') return [];

  if (persona === 'department') {
    return [
      intro(
        'Taleplerim nedir?',
        'Biriminizin satın almaya yazdığı işler buradadır. Bu sayfa liste izleme yeridir; yeni iş açmak için sağdaki “Yeni talep”e basarsınız. Tedarikçiye siz mail atmazsınız.'
      ),
      step(
        'taleplerim-new',
        'Yeni talep',
        'Kalem, açıklama ve ekleri yazdığınız form buradan açılır (`/taleplerim/yeni`). Gönderince satın alma yetkilisi görür. Bu pano form değildir.'
      ),
      step(
        'taleplerim-board',
        'Süreç sütunları',
        'Taslak → incelemede → onay → teklif → temin. Kartı ilgili sütuna bakarak “ne oldu?”yu görürsünüz. Taslağa ve henüz teklife dönüşmemiş karta tıklayınca formu düzenlersiniz.'
      ),
    ];
  }

  return [
    intro(
      'Benim taleplerim',
      'Burası sizin kişisel birim taleplerinizdir. Satın alma kuyruğundaki herkesin işi “Birim tedarik talepleri”ndedir; tedarikçiye giden listeler “Tedarikçi talepleri”ndedir.'
    ),
    step(
      'taleplerim-new',
      'Yeni talep',
      'Satın alma yetkilisine iç talep yazmak için. Tedarikçi seçip fiyat sormak istiyorsanız “Tedarikçi talebi oluştur” sayfasını kullanın.'
    ),
    step(
      'taleplerim-board',
      'Süreç sütunları',
      'Gönderdiğiniz kaydın satın alma sürecindeki yeri. Taslaklar henüz iletilmemiştir; diğer sütunlar inceleniyor / teklif / temin aşamasıdır.'
    ),
  ];
}

function taleplerimYeniSteps(persona: TourPersona): TourStep[] {
  if (persona === 'supplier') return [];

  const toWhom =
    persona === 'department'
      ? 'Form, Satın Alma Birimi yetkilisine gider. Tedarikçi bu kaydı görmez.'
      : 'Form, satın alma yetkilisine iç talep olarak gider. Tedarikçiye e-posta gitmez.';

  return [
    intro(
      'Yeni birim talebi',
      `${toWhom} Bu ekran “Tedarikçi talebi oluştur” sayfası değildir; orada firma seçilip fiyat sorulur.`
    ),
    step('birim-form-head', 'Ne yazıyorsunuz?', 'Konu ve birim zorunludur. Açıklama, satın almanın doğru malı sormasını kolaylaştırır.'),
    step('birim-form-info', 'Talep bilgileri', 'Konu, birim, ihtiyaç tarihi ve serbest açıklama. Birimi listeden seçin; yoksa yöneticinin tanımlaması gerekir.'),
    step(
      'birim-form-excel',
      'Excel ile toplu kalem',
      'Boş şablonu indirin (Ürün, Miktar, Birim, Açıklama). Doldurup “Hazır Excel yükle” ile tüm satırlar forma gelir. Şablon içeriğini yönetici ayarlardan değiştirir.'
    ),
    step(
      'birim-form-items',
      'Kalemler',
      'Her satır bir üründür: ad, miktar, birim. Listede olmayan birimi (koli, teneke…) yazıp Enter’a basın veya “yeni birim ekle” ile kaydedin.'
    ),
    step('birim-form-files', 'Ekler', 'Şartname, fotoğraf veya ek dosya isteğe bağlıdır. Zorunlu değildir ama netleştirir.'),
    step(
      'birim-form-submit',
      'Talebi ilet',
      'Gönderince kayıt “Taleplerim” panosunda İncelemede’ye düşer. Taslak olarak bırakırsanız yalnızca siz görürsünüz.'
    ),
  ];
}

function internalSteps(persona: TourPersona): TourStep[] {
  if (persona !== 'admin' && persona !== 'sa-manager' && persona !== 'sa-staff') return [];

  if (persona === 'sa-staff') {
    return [
      intro(
        'Birim tedarik kuyruğu',
        'Birimlerin yazdığı talepler buradadır. Siz onaylamazsınız; yetkili inceler. Tedarikçiye fiyat sormak da bu sayfadan olmaz.'
      ),
      step(
        'inbox-new',
        'Yetkiliye talep',
        'Kendi kalemlerinizi yetkiliye iletmek için. Bu düğme tedarikçiye mail atmaz. Tedarikçi listesi solda “Tedarikçi talepleri”dir.'
      ),
      step('inbox-filters', 'Birim süzgeci', 'Üstteki birim etiketleriyle kuyruğu daraltırsınız. Seçili birimler sütunlarda sayılır.'),
      step(
        'inbox-board',
        'Aşamalar',
        'Soldan sağa: inceleme, karar, teklif, temin. Kartı açınca yazışmayı görürsünüz. “Yetkili onayında” sizin göndermenizi değil, yöneticinin onayını bekler.'
      ),
    ];
  }

  return [
    intro(
      'Birim tedarik kuyruğu',
      'Birim kullanıcılarının ve satın alma personelinin size ilettiği işler. Burada inceler, reddeder veya onaylayıp tedarikçi talebine çevirirsiniz. Bu sayfa tedarikçi listesi değildir.'
    ),
    step(
      'inbox-new',
      'Yeni birim talebi',
      'Siz de iç talep açabilirsiniz. Tedarikçiye fiyat sormak için “Tedarikçi talebi oluştur” (`/procurement/new`) kullanılır.'
    ),
    step('inbox-filters', 'Birim süzgeci', 'Fabrika / birim etiketleriyle panoyu daraltın. Sayılar o birimin bekleyen işidir.'),
    step(
      'inbox-board',
      'Aşamalar',
      'Kartı sütununa göre okuyun. Onayınızdan sonra iş tedarikçi talebine döner ve “Tedarikçi talepleri” listesinde görünür.'
    ),
  ];
}

function procurementSteps(persona: TourPersona): TourStep[] {
  if (persona === 'department') return [];

  if (persona === 'supplier') {
    return [
      intro(
        'Teklif listeniz',
        'Size iletilen fiyat istekleri buradadır. Bir satıra tıklayınca kalemleri görür ve teklif girersiniz. Yeni talep açamazsınız.'
      ),
      step('rfq-list-head', 'Başlık ve durum', 'Her satır bir teklif talebidir. Durum rozeti cevabınızın alınıp alınmadığını gösterir.'),
      step('rfq-list-filters', 'Arama', 'Liste başlığı veya durum ile süzebilirsiniz.'),
      step('rfq-list-rows', 'Kayıtlar', 'Açmak için satıra tıklayın. Teklif verdikten sonra da aynı yerden kaydı bulursunuz.'),
    ];
  }

  const staff = persona === 'sa-staff';
  return [
    intro(
      'Tedarikçi talepleri',
      staff
        ? 'Burada tedarikçilere gitmiş (veya yetkilinin hazırladığı) listeler durur. Birimlerin ham talepleri “Birim tedarik talepleri”ndedir. Siz buradan tedarikçiye yeni mail atamazsınız.'
        : 'Tedarikçilere fiyat sorulan listeler. Birim içi talep “Taleplerim” veya “Birim tedarik talepleri”ndedir; karıştırmayın.'
    ),
    step(
      'rfq-list-new',
      staff ? 'Yetkiliye talep' : 'Yeni tedarikçi talebi',
      staff
        ? 'Kalem yazıp yetkiliye iletirsiniz. Tedarikçi seçimi ve e-posta yetkili formundadır.'
        : 'Firmalara e-posta ile fiyat sormak için `/procurement/new`. Birim kuyruğundan onayladığınız iş de çoğu zaman bu forma bağlanır.'
    ),
    step('rfq-list-filters', 'Arama ve süzgeç', 'Başlık, tedarikçi, durum veya fatura durumuna göre listeyi daraltın.'),
    step(
      'rfq-list-rows',
      'Kayıtlar',
      'Taslak henüz firmaya gitmemiştir. “Tedarikçiye iletildi” fiyat bekler. Satıra tıklayınca teklifleri ve yazışmayı açarsınız.'
    ),
  ];
}

function procurementNewSteps(persona: TourPersona): TourStep[] {
  if (persona === 'department' || persona === 'supplier') return [];

  if (persona === 'sa-staff') {
    return [
      intro(
        'Yetkiliye talep',
        'Bu form tedarikçiye gitmez. Kalemleri yazıp yetkiliye iletirsiniz; fiyat sorma ve firma seçimi yetkilidedir. Birim kullanıcılarının formu ise “Taleplerim / Yeni talep”tir.'
      ),
      step('rfq-head', 'Sayfa amacı', 'Başlık “Yetkiliye talep” ise e-posta yok demektir. Yanlış sayfadaysanız soldan “Birim tedarik talepleri”ne dönün.'),
      step('rfq-info', 'Talep bilgileri', 'Liste adı ve birim, yetkilinin işi tanıması içindir.'),
      step('rfq-items', 'Kalemler', 'Ürün, miktar, birim. Çok kalem varsa Excel kartı (görünüyorsa) toplu aktarır.'),
      step('rfq-actions', 'Yetkiliye gönder', 'Bu düğme satın alma yetkilisine iletir. Tedarikçi kutusu bu ekranda yoktur.'),
    ];
  }

  return [
    intro(
      'Yeni tedarikçi talebi',
      'Seçtiğiniz firmalara e-posta ile fiyat sorarsınız. Birim içi talep için “Taleplerim / Yeni talep” veya kuyruktaki “Yeni birim talebi” kullanılır.'
    ),
    step(
      'rfq-head',
      'Bu sayfa ne işe yarar?',
      'Tedarikçi + kalem + gönder. Birim kuyruğundan geliyorsanız zaten onaylanmış işi firmaya çeviriyorsunuz demektir.'
    ),
    step(
      'rfq-excel',
      'Excel ile kalem',
      'Çok satır varsa şablonu indirip yükleyin. Mevcut satırların üzerine yazar. Şablon, üretim veya satın alma modülünüze göredir.'
    ),
    step('rfq-info', 'Talep bilgileri', 'Liste adı zorunludur. Birim, süre ve ekler tedarikçinin anlamasını kolaylaştırır.'),
    step(
      'rfq-vendors',
      'Tedarikçi seçimi',
      'En az bir firma seçin. Gönderince bu firmalara teklif linki gider. Seçmezseniz liste iletilmez.'
    ),
    step('rfq-items', 'Talep kalemleri', 'Her satır bir üründür. Gruplayabilir, fotoğraf ve not ekleyebilirsiniz.'),
    step(
      'rfq-actions',
      'Kaydet veya gönder',
      'Taslak yalnızca sizde kalır. “Listeyi tamamla ve önizle” e-postayı açar: üretimde sütunlar + CC, ardından önizleme. Asıl gönderim o pencerededir; bu tur form içindir, sihirbaz ayrı anlatılır.'
    ),
  ];
}

function procurementNewSendSteps(persona: TourPersona): TourStep[] {
  if (persona === 'department' || persona === 'supplier' || persona === 'sa-staff') return [];

  const fullWizard =
    persona === 'admin' || persona === 'production-manager' || persona === 'production-staff';

  if (fullWizard) {
    return [
      step(
        'rfq-wiz-head',
        'Gönderim sihirbazı',
        'Form bitti; tedarikçi henüz mail almadı. Üç adım: sütunlar, yönetici CC, e-posta. Kapatırsanız taslak kalır, gönderilmiş olmaz.'
      ),
      reveal(
        'rfq-wiz-columns',
        'rfq-preview-columns',
        'Tedarikçi ne görsün?',
        'Yıldızlı alanlar zorunludur. İsterseniz stok, tonaj, açıklama gibi sütunları kapatırsınız; teklif formu buna göre üretilir.'
      ),
      reveal(
        'rfq-wiz-managers',
        'rfq-preview-managers',
        'Yönetici CC',
        'İsteğe bağlı. İşaretlenen kişiler tedarikçiyle aynı bildirimin kopyasını alır. Listeyi satın alma sorumlusu dolduramaz; yönetici “Teklif bildirimi CC”den ekler. Boş bırakmak serbesttir.'
      ),
      reveal(
        'rfq-wiz-email',
        'rfq-preview-email',
        'E-posta önizleme',
        'Firmaların göreceği içerik budur. Kalem veya tedarikçi yanlışsa geri dönüp formu düzeltin; bu ekrandan göndermek kaydı kilitler.'
      ),
      step(
        'rfq-wiz-send',
        'Onayla ve gönder',
        'Bu düğme listeyi kaydeder ve seçilen firmalara linki iletir. Tur gönderimi tıklamaz. Gönül rahatlığıyla bakın, sonra siz basın.'
      ),
    ];
  }

  return [
    step(
      'rfq-wiz-head',
      'E-posta önizleme',
      'Satın almada sütun/CC sihirbazı yoktur; doğrudan önizleme açılır. Tedarikçi henüz mail almamıştır.'
    ),
    reveal(
      'rfq-wiz-email',
      'rfq-preview-email',
      'Gönderilecek içerik',
      'Kalemler ve firmalar burada görünür. Yanlışsa pencereyi kapatıp formu düzeltin.'
    ),
    step(
      'rfq-wiz-send',
      'Onayla ve gönder',
      'Basınca kayıt oluşur ve tedarikçiye e-posta gider. Tur tıklamaz; hazır olunca siz gönderin.'
    ),
  ];
}

function procurementDetailSteps(persona: TourPersona): TourStep[] {
  if (persona === 'department') return [];

  if (persona === 'supplier') {
    return [
      intro(
        'Teklif kaydınız',
        'Satın alma size fiyat sormuş. Kalemlere birim fiyat girip üstteki gönder düğmesiyle iletirsiniz. Karar başladıktan sonra fiyat kilitlenir.'
      ),
      step('rfq-detail-head', 'Durum', 'Rozet, listenin aşamasını gösterir: fiyat bekleniyor, teklif alındı, onaylandı…'),
      step(
        'rfq-detail-quote',
        'Fiyatları gönder',
        'Tüm kalemleri doldurduktan sonra buradan onaya sunarsınız. Excel ile toplu fiyat da kullanılabilir (sayfada varsa).'
      ),
      step('rfq-detail-items', 'Kalemler ve fiyat', 'Her satıra birim fiyat, kur ve not. Boş satır teklif sayılmaz.'),
    ];
  }

  return [
    intro(
      'Tedarikçi talebi detayı',
      'Gönderdikten sonra iş buradadır: teklifler, yazışma, düzenleme ve (üretimde) analiz. Yeni talep açmak için değil; bu kaydı yürütmek için.'
    ),
    step('rfq-detail-head', 'Başlık ve durum', 'Hangi listedesiniz ve süreç neresinde. Taslak henüz firmaya gitmemiştir.'),
    step(
      'rfq-detail-vendors',
      'Seçilen firmalar',
      'Bu talebe fiyat sorulan cariler. Eksik firma varsa “Listeyi düzenle” ile eklenir; yeni talep açılmaz.'
    ),
    step(
      'rfq-detail-items',
      'Ürünler ve teklifler',
      'Kalemler, gelen fiyatlar ve altta tedarikçi toplamları. Karşılaştırma için üretim modülünde Analiz Raporları da vardır.'
    ),
    step(
      'rfq-detail-actions',
      'Hızlı işlemler',
      'Listeyi düzenle, teklif form bağlantıları, kopyala. Tedarikçiye tekrar sormak çoğu zaman düzenle + kaydettir; sıfırdan form değil.'
    ),
  ];
}

function vendorsSteps(persona: TourPersona): TourStep[] {
  if (persona === 'department' || persona === 'supplier') return [];
  return [
    intro(
      'Tedarikçi listesi',
      'Fiyat soracağınız firmalar burada tanımlanır. Kayıt yoksa tedarikçi talebinde seçim boş kalır. Bu sayfa talep oluşturmaz.'
    ),
    step('vendors-head', 'Yeni tedarikçi', 'Unvan, e-posta ve telefon. Mail bu adrese gider; yanlış adres sessizce kaybolur.'),
    step(
      'vendors-filters',
      'Arama',
      'Firma adı, “ne satıyor”, yetkili veya vergi no. Çok kayıt olunca talep formundaki seçici de buradan beslenir.'
    ),
    step('vendors-list', 'Kayıtlar', 'Satıra tıklayıp düzenlersiniz. Silmek teklif geçmişini etkileyebilir; dikkatli olun.'),
  ];
}

function analysisSteps(persona: TourPersona): TourStep[] {
  if (persona !== 'admin' && persona !== 'production-manager' && persona !== 'production-staff') return [];
  return [
    intro(
      'Analiz raporları',
      'Teklif gelmiş listeleri yan yana karşılaştırırsınız. Yeni talep veya birim kuyruğu değildir. Satın alma modülünde bu menü gizlidir.'
    ),
    step('analysis-head', 'Ne zaman dolu?', 'Fiyatı gelen (veya tamamlanan) talepler kart olur. Teklif yoksa burası boştur — bu bir arıza değil.'),
    step('analysis-search', 'Talep ara', 'Liste adına göre süzün. Karta basınca o talebin karşılaştırma ekranı açılır.'),
    step('analysis-list', 'Rapor kartları', 'Bir kaydı açınca tedarikçi sütunları, notlar ve karar akışı oradadır.'),
  ];
}

const BUILDERS: Record<TourPageId, (p: TourPersona) => TourStep[]> = {
  dashboard: dashboardSteps,
  taleplerim: taleplerimSteps,
  'taleplerim-yeni': taleplerimYeniSteps,
  'internal-requests': internalSteps,
  procurement: procurementSteps,
  'procurement-new': procurementNewSteps,
  'procurement-new-send': procurementNewSendSteps,
  'procurement-detail': procurementDetailSteps,
  vendors: vendorsSteps,
  'analysis-reports': analysisSteps,
};

export function buildTour(persona: TourPersona, pageId: TourPageId): TourDef | null {
  const steps = BUILDERS[pageId](persona).filter(Boolean);
  if (!steps.length) return null;
  return { id: `${pageId}:${persona}`, steps };
}

export const NAV_TOUR_ATTR: Record<string, string> = {
  '/dashboard': 'nav-dashboard',
  '/procurement/new': 'nav-procurement-new',
  '/taleplerim': 'nav-taleplerim',
  '/internal-requests': 'nav-internal',
  '/procurement': 'nav-procurement',
  '/vendors': 'nav-vendors',
  '/vendor-history': 'nav-vendor-history',
  '/analysis-reports': 'nav-analysis',
  '/procurement-actions': 'nav-procurement-group',
  '/vendor-actions': 'nav-vendors-group',
  '/settings': 'nav-settings',
};
