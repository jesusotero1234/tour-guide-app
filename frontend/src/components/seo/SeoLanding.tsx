import Image from 'next/image';
import Link from 'next/link';
import { TourCover } from '@/components/tours/TourCover';
import { TourSample } from '@/components/tours/TourSample';
import { safeCreditUrl } from '@/components/legal/SourceCredits';
import { cityContent, cityPath, routePath, type SeoEntry, type SeoLocale, type SeoWalkingRoute, type SeoCity, SEO_CITIES } from '@/lib/seoCatalog';
import { seoCopy } from '@/lib/seoCopy';
import { SeoRouteMap } from './SeoRouteMap';
import { SeoLanguageSwitcher } from './SeoLanguageSwitcher';
import '@/components/tours/MobileTours.css';
import './SeoLanding.css';

function Header({ locale, alternates }: { locale: SeoLocale; alternates: Record<string, string> }) {
  return <header className="seo-header">
    <Link href="/tours" className="nomuvia-wordmark"><Image src="/icon.png" unoptimized alt="" width={40} height={40} className="nomuvia-brand-icon" />nomuvia</Link>
    <SeoLanguageSwitcher key={locale} locale={locale} label={seoCopy(locale).languageNav} alternates={alternates} />
  </header>;
}

function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</>;
}

export function CityLanding({ locale, city, entries, alternates }: { locale: SeoLocale; city: SeoCity; entries: SeoEntry[]; alternates: Record<string, string> }) {
  const t = seoCopy(locale), cityName = city.names[locale], content = cityContent(locale, city);
  return <div className="tour-entry seo-landing">
    <div className="seo-shell">
      <Header locale={locale} alternates={alternates} />
      <main>
        <section className="seo-city-intro">
          <p className="tour-eyebrow">{cityName + " · " + t.cityEyebrow}</p>
          <h1>{content.heading}</h1>
          <p className="seo-lead">{content.description}</p>
          <p className="seo-promise">{t.cityPromise}</p>
          <a className="seo-button" href="#walks">{t.findWalk} <span aria-hidden="true">↓</span></a>
        </section>
        <section id="walks" className="seo-section" aria-labelledby="walks-heading">
          <div className="seo-section-heading"><h2 id="walks-heading">{t.walksHeading}</h2><span>{t.audioText}</span></div>
          <div className="seo-walks">{entries.map(({ route, tour }, index) => <article key={tour.id} className="seo-walk">
            <TourCover tour={tour} />
            <div className="seo-walk-body">
              <p className="tour-eyebrow">{String(index + 1).padStart(2, '0')} / {t.atPace}</p>
              <h3><Link href={routePath(route)}>{route.title}</Link></h3>
              <p>{route.summary}</p>
              <p className="seo-facts-inline">{tour.places.length} {t.stops} · ~{tour.durationMinutes} min {"(" + t.estimate + ")"}</p>
              <p className="seo-stop-names">{tour.places.map(place => place.nameInTourLanguage || place.name).join(' · ')}</p>
              <Link className="seo-text-link" href={routePath(route)}>{t.exploreRoute} <span aria-hidden="true">↗</span></Link>
            </div>
          </article>)}</div>
        </section>
        <section className="seo-section seo-reading">
          <p className="tour-eyebrow">{t.walkingIn(cityName)}</p>
          <h2>{t.readingHeading}</h2>
          <p>{t.readingParagraphs[0]}</p>
          <p>{t.readingParagraphs[1]}</p>
          <ol className="seo-how"><li>{t.howSteps[0]}</li><li>{t.howSteps[1]}</li><li>{t.howSteps[2]}</li></ol>
        </section>
        <section className="seo-section seo-reading seo-faq" aria-labelledby="faq-heading">
          <h2 id="faq-heading">{t.faqTitle}</h2>
          <details><summary>{t.faq[0].question}</summary><p>{t.faq[0].answer}</p></details>
          <details><summary>{t.faq[1].question}</summary><p>{t.faq[1].answer}</p></details>
          <details><summary>{t.faq[2].question}</summary><p>{t.faq[2].answer}</p></details>
        </section>
        <p className="seo-disclosure">{t.disclosure} <Link href={`/about?lang=${locale}`}>{t.about}</Link></p>
        <nav className="seo-section" aria-label={t.otherCities}><h2>{t.otherCities}</h2><div className="seo-city-links">{SEO_CITIES.filter(other => other.slug !== city.slug).map(other => <Link key={other.slug} className="seo-text-link" href={cityPath(locale, other.slug)}>{other.names[locale]}</Link>)}</div></nav>
        <Link className="seo-text-link" href="/tours">{t.allCities} →</Link>
      </main>
    </div>
  </div>;
}

export function RouteLanding({ entry, alternates, walkingRoute }: { entry: SeoEntry; alternates: Record<string, string>; walkingRoute: SeoWalkingRoute | null }) {
  const { route, tour, city } = entry;
  const locale = route.locale, t = seoCopy(locale), cityName = city.names[locale];
  const first = tour.places[0];
  const startUrl = `/tours/${tour.id}?listen=1`;
  const directions = 'https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', destination: `${first.latitude},${first.longitude}`, travelmode: 'walking' });
  return <div className="tour-entry seo-landing">
    <div className="seo-shell">
      <Header locale={locale} alternates={alternates} />
      <main>
        <nav className="seo-breadcrumbs" aria-label={t.breadcrumbs}><Link href="/tours">{t.cities}</Link><span aria-hidden="true">/</span><Link href={cityPath(locale, city.slug)}>{cityName}</Link></nav>
        <section className="seo-route-intro">
          <div><p className="tour-eyebrow">{cityName + " · " + t.routeEyebrow}</p><h1>{route.title}</h1><p className="seo-lead">{route.summary}</p><p className="seo-promise">{t.routePromise}</p></div>
          <TourCover tour={tour} />
        </section>
        <section className="seo-start" aria-label={t.planWalk}>
          <dl className="seo-facts"><div><dt>{t.startPoint}</dt><dd>{first.nameInTourLanguage || first.name}</dd></div><div><dt>{t.duration}</dt><dd>~{tour.durationMinutes} min</dd></div><div><dt>{t.stops}</dt><dd>{tour.places.length}</dd></div><div><dt>{t.audioAndText}</dt><dd>{t.audioLanguage}</dd></div></dl>
          {walkingRoute && <p>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(walkingRoute.distanceMeters / 1000)} km · ~{Math.ceil(walkingRoute.durationSeconds / 60)} min {t.walkingOnly}</p>}
          <p className="seo-small">{t.durationNote}</p>
          <div className="seo-start-actions"><Link href={startUrl} className="seo-button">{t.startWalk} <span aria-hidden="true">→</span></Link><a className="seo-text-link" href={directions} target="_blank" rel="noopener noreferrer">{t.directions} ↗</a></div>
          <TourSample tour={{ ...tour, title: route.title }} language={locale} expanded />
          <p className="seo-small">{t.headphones}</p>
        </section>
        {tour.introduction && <section className="seo-section seo-reading"><h2>{t.walkStory}</h2><Paragraphs text={tour.introduction} /></section>}
        <section className="seo-section seo-reading" aria-labelledby="route-stops"><h2 id="route-stops">{t.routeStops}</h2><p>{t.openStop}</p>
          <ol className="seo-stops">{tour.places.map((place, index) => <li key={place.id} id={`stop-${index + 1}`}><details>
            <summary><span className="seo-stop-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{place.nameInTourLanguage || place.name}</span></summary>
            <div className="seo-transcript"><Paragraphs text={place.description} />
              {!!place.metadata?.sourceCredits?.items.length && <details className="seo-sources"><summary>{t.sources}</summary><ul>{place.metadata.sourceCredits.items.map(source => <li key={source.sourceId}>
                {safeCreditUrl(source.revisionUrl || source.url) ? <a href={safeCreditUrl(source.revisionUrl || source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}
                <p>{source.attribution}</p>{source.license && safeCreditUrl(source.licenseUrl) && <a href={safeCreditUrl(source.licenseUrl)} target="_blank" rel="noopener noreferrer">{source.license}</a>}
              </li>)}</ul></details>}
            </div>
          </details></li>)}</ol>
          <SeoRouteMap tourId={tour.id} language={locale} stops={tour.places.map(place => ({ id: place.id, name: place.nameInTourLanguage || place.name, position: place.position, latitude: place.latitude, longitude: place.longitude }))} />
        </section>
        <section className="seo-section seo-reading seo-disclosure">
          <p>{t.disclosure} <Link href={`/about?lang=${locale}`}>{t.about}</Link></p>
          {tour.pilot?.scriptLicense === 'CC BY-SA 4.0' && <p>{t.textLicense} <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>}
          <Link className="seo-button" href={startUrl}>{t.startListening} →</Link>
          <Link className="seo-text-link" href={cityPath(locale, city.slug)}>{t.cityTitle(cityName)}</Link>
        </section>
      </main>
    </div>
  </div>;
}
