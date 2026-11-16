#!/usr/bin/env python3
"""Builds the static SHULYQ site: one HTML file per language from src/template.html + src/strings.json.

Run:  python3 build.py
Output: index.html (kk), ru/index.html, en/index.html, sitemap.xml, robots.txt
"""
import json, os, re

DOMAIN = "https://shulyq.store"          # change here if the final domain differs
INSTAGRAM = "https://www.instagram.com/shulyq.kz/"
LANGS = {"kk": "", "ru": "ru/", "en": "en/"}   # language -> path under the site root
LABELS = {"kk": "ҚАЗ", "ru": "RU", "en": "EN"}
OG_LOCALE = {"kk": "kk_KZ", "ru": "ru_KZ", "en": "en_US"}

here = os.path.dirname(os.path.abspath(__file__))
template = open(os.path.join(here, "src/template.html"), encoding="utf-8").read()
strings = json.load(open(os.path.join(here, "src/strings.json"), encoding="utf-8"))
attr = lambda x: x.replace("&", "&amp;").replace('"', "&quot;")


def head(lang):
    url = f"{DOMAIN}/{LANGS[lang]}"
    title, desc = strings["title"][lang], strings["desc"][lang]
    alternates = "".join(f'<link rel="alternate" hreflang="{l}" href="{DOMAIN}/{p}">\n' for l, p in LANGS.items())
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Organization", "@id": f"{DOMAIN}/#organization", "name": "SHULYQ", "url": f"{DOMAIN}/",
         "description": desc, "sameAs": [INSTAGRAM],
         "address": {"@type": "PostalAddress", "addressLocality": "Aktau", "addressRegion": "Mangystau", "addressCountry": "KZ"}},
        {"@type": "WebSite", "@id": f"{DOMAIN}/#website", "url": f"{DOMAIN}/", "name": "SHULYQ",
         "inLanguage": list(LANGS), "publisher": {"@id": f"{DOMAIN}/#organization"}},
    ]}
    return (f'<meta name="description" content="{attr(desc)}">\n<title>{title}</title>\n'
            f'<link rel="canonical" href="{url}">\n{alternates}'
            f'<link rel="alternate" hreflang="x-default" href="{DOMAIN}/">\n'
            f'<meta property="og:type" content="website">\n<meta property="og:site_name" content="SHULYQ">\n'
            f'<meta property="og:title" content="{attr(title)}">\n<meta property="og:description" content="{attr(desc)}">\n'
            f'<meta property="og:url" content="{url}">\n<meta property="og:image" content="{DOMAIN}/images/shulyq-outside.png">\n'
            f'<meta property="og:locale" content="{OG_LOCALE[lang]}">\n<meta name="twitter:card" content="summary_large_image">\n'
            f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>')


def switch(lang, root):
    links = "".join(f'<a href="{root}{p}" hreflang="{l}" lang="{l}"' + (' aria-current="page"' if l == lang else "") + f">{LABELS[l]}</a>"
                    for l, p in LANGS.items())
    return f'<div class="langs" role="group" aria-label="{attr(strings["langs"][lang])}">{links}</div>'


for lang, path in LANGS.items():
    root = "../" if path else "./"
    values = {k: v[lang] for k, v in strings.items()}
    values.update(lang=lang, root=root, head=head(lang), switch=switch(lang, root))
    missing = set(re.findall(r"\{\{(\w+)\}\}", template)) - set(values)
    assert not missing, f"no strings for: {missing}"
    html = re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], template)
    out = os.path.join(here, path, "index.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write(html)
    print("built", os.path.relpath(out, here))

urls = "".join(
    f"<url><loc>{DOMAIN}/{p}</loc>"
    + "".join(f'<xhtml:link rel="alternate" hreflang="{l}" href="{DOMAIN}/{q}"/>' for l, q in LANGS.items())
    + "</url>\n" for p in LANGS.values())
open(os.path.join(here, "sitemap.xml"), "w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls + "</urlset>\n")
open(os.path.join(here, "robots.txt"), "w").write(
    "User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: Googlebot\nAllow: /\n\nUser-agent: Bingbot\nAllow: /\n\n"
    f"User-agent: *\nAllow: /\n\nSitemap: {DOMAIN}/sitemap.xml\n")
print("built sitemap.xml, robots.txt")
