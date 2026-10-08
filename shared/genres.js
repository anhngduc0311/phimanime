// Canonical keys keep existing Vietnamese filter URLs compatible.
const aliases = {
  action: 'hanh-dong', adventure: 'phieu-luu', comedy: 'hai-huoc', romance: 'tinh-cam',
  drama: 'chinh-kich', horror: 'kinh-di', mystery: 'bi-an', sports: 'the-thao',
  'sci-fi': 'khoa-hoc', school: 'hoc-duong', music: 'am-nhac',
  'martial-arts': 'vo-thuat', historical: 'lich-su', military: 'chien-tranh',
  mythology: 'than-thoai', psychological: 'tam-ly', kids: 'tre-em'
};
export function genreKey(value) {
  const slug = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return aliases[slug] || slug;
}
export const ANIME_GENRES = [
  {
    "id": 1,
    "name": "Action",
    "slug": "action",
    "posts_count": 3358
  },
  {
    "id": 2,
    "name": "Adventure",
    "slug": "adventure",
    "posts_count": 1344
  },
  {
    "id": 3,
    "name": "Avant Garde",
    "slug": "avant-garde",
    "posts_count": 22
  },
  {
    "id": 4,
    "name": "Award Winning",
    "slug": "award-winning",
    "posts_count": 21
  },
  {
    "id": 5,
    "name": "Boys Love",
    "slug": "boys-love",
    "posts_count": 58
  },
  {
    "id": 6,
    "name": "Comedy",
    "slug": "comedy",
    "posts_count": 2260
  },
  {
    "id": 7,
    "name": "Drama",
    "slug": "drama",
    "posts_count": 1309
  },
  {
    "id": 8,
    "name": "Fantasy",
    "slug": "fantasy",
    "posts_count": 1908
  },
  {
    "id": 9,
    "name": "Girls Love",
    "slug": "girls-love",
    "posts_count": 54
  },
  {
    "id": 10,
    "name": "Gourmet",
    "slug": "gourmet",
    "posts_count": 25
  },
  {
    "id": 11,
    "name": "Horror",
    "slug": "horror",
    "posts_count": 219
  },
  {
    "id": 12,
    "name": "Mystery",
    "slug": "mystery",
    "posts_count": 457
  },
  {
    "id": 13,
    "name": "Romance",
    "slug": "romance",
    "posts_count": 1293
  },
  {
    "id": 14,
    "name": "Sci-Fi",
    "slug": "sci-fi",
    "posts_count": 1050
  },
  {
    "id": 15,
    "name": "Slice of Life",
    "slug": "slice-of-life",
    "posts_count": 818
  },
  {
    "id": 16,
    "name": "Sports",
    "slug": "sports",
    "posts_count": 429
  },
  {
    "id": 17,
    "name": "Supernatural",
    "slug": "supernatural",
    "posts_count": 1678
  },
  {
    "id": 18,
    "name": "Suspense",
    "slug": "suspense",
    "posts_count": 94
  },
  {
    "id": 19,
    "name": "Ecchi",
    "slug": "ecchi",
    "posts_count": 425
  },
  {
    "id": 20,
    "name": "Erotica",
    "slug": "erotica",
    "posts_count": 402
  },
  {
    "id": 21,
    "name": "Hentai",
    "slug": "hentai",
    "posts_count": 38
  },
  {
    "id": 22,
    "name": "Adult Cast",
    "slug": "adult-cast",
    "posts_count": 178
  },
  {
    "id": 23,
    "name": "Anthropomorphic",
    "slug": "anthropomorphic",
    "posts_count": 46
  },
  {
    "id": 24,
    "name": "CGDCT",
    "slug": "cgdct",
    "posts_count": 58
  },
  {
    "id": 25,
    "name": "Childcare",
    "slug": "childcare",
    "posts_count": 44
  },
  {
    "id": 26,
    "name": "Combat Sports",
    "slug": "combat-sports",
    "posts_count": 417
  },
  {
    "id": 27,
    "name": "Crossdressing",
    "slug": "crossdressing",
    "posts_count": 16
  },
  {
    "id": 28,
    "name": "Delinquents",
    "slug": "delinquents",
    "posts_count": 32
  },
  {
    "id": 29,
    "name": "Detective",
    "slug": "detective",
    "posts_count": 44
  },
  {
    "id": 30,
    "name": "Educational",
    "slug": "educational",
    "posts_count": 1116
  },
  {
    "id": 31,
    "name": "Gag Humor",
    "slug": "gag-humor",
    "posts_count": 37
  },
  {
    "id": 32,
    "name": "Gore",
    "slug": "gore",
    "posts_count": 68
  },
  {
    "id": 33,
    "name": "Harem",
    "slug": "harem",
    "posts_count": 283
  },
  {
    "id": 34,
    "name": "High Stakes Game",
    "slug": "high-stakes-game",
    "posts_count": 174
  },
  {
    "id": 35,
    "name": "Historical",
    "slug": "historical",
    "posts_count": 485
  },
  {
    "id": 36,
    "name": "Idols (Female)",
    "slug": "idols-female",
    "posts_count": 6
  },
  {
    "id": 37,
    "name": "Idols (Male)",
    "slug": "idols-male",
    "posts_count": 4
  },
  {
    "id": 38,
    "name": "Isekai",
    "slug": "isekai",
    "posts_count": 278
  },
  {
    "id": 39,
    "name": "Iyashikei",
    "slug": "iyashikei",
    "posts_count": 804
  },
  {
    "id": 40,
    "name": "Love Polygon",
    "slug": "love-polygon",
    "posts_count": 12
  },
  {
    "id": 41,
    "name": "Magical Sex Shift",
    "slug": "magical-sex-shift",
    "posts_count": 9
  },
  {
    "id": 42,
    "name": "Mahou Shoujo",
    "slug": "mahou-shoujo",
    "posts_count": 441
  },
  {
    "id": 43,
    "name": "Martial Arts",
    "slug": "martial-arts",
    "posts_count": 349
  },
  {
    "id": 44,
    "name": "Mecha",
    "slug": "mecha",
    "posts_count": 346
  },
  {
    "id": 45,
    "name": "Medical",
    "slug": "medical",
    "posts_count": 11
  },
  {
    "id": 46,
    "name": "Military",
    "slug": "military",
    "posts_count": 249
  },
  {
    "id": 47,
    "name": "Music",
    "slug": "music",
    "posts_count": 389
  },
  {
    "id": 48,
    "name": "Mythology",
    "slug": "mythology",
    "posts_count": 104
  },
  {
    "id": 49,
    "name": "Organized Crime",
    "slug": "organized-crime",
    "posts_count": 34
  },
  {
    "id": 50,
    "name": "Otaku Culture",
    "slug": "otaku-culture",
    "posts_count": 20
  },
  {
    "id": 51,
    "name": "Parody",
    "slug": "parody",
    "posts_count": 147
  },
  {
    "id": 52,
    "name": "Performing Arts",
    "slug": "performing-arts",
    "posts_count": 376
  },
  {
    "id": 53,
    "name": "Pets",
    "slug": "pets",
    "posts_count": 11
  },
  {
    "id": 54,
    "name": "Psychological",
    "slug": "psychological",
    "posts_count": 297
  },
  {
    "id": 55,
    "name": "Racing",
    "slug": "racing",
    "posts_count": 182
  },
  {
    "id": 56,
    "name": "Reincarnation",
    "slug": "reincarnation",
    "posts_count": 263
  },
  {
    "id": 57,
    "name": "Reverse Harem",
    "slug": "reverse-harem",
    "posts_count": 269
  },
  {
    "id": 58,
    "name": "Love Status Quo",
    "slug": "love-status-quo",
    "posts_count": 3
  },
  {
    "id": 59,
    "name": "Samurai",
    "slug": "samurai",
    "posts_count": 72
  },
  {
    "id": 60,
    "name": "School",
    "slug": "school",
    "posts_count": 1240
  },
  {
    "id": 61,
    "name": "Showbiz",
    "slug": "showbiz",
    "posts_count": 373
  },
  {
    "id": 62,
    "name": "Space",
    "slug": "space",
    "posts_count": 166
  },
  {
    "id": 63,
    "name": "Strategy Game",
    "slug": "strategy-game",
    "posts_count": 175
  },
  {
    "id": 64,
    "name": "Super Power",
    "slug": "super-power",
    "posts_count": 1269
  },
  {
    "id": 65,
    "name": "Survival",
    "slug": "survival",
    "posts_count": 27
  },
  {
    "id": 66,
    "name": "Team Sports",
    "slug": "team-sports",
    "posts_count": 415
  },
  {
    "id": 67,
    "name": "Time Travel",
    "slug": "time-travel",
    "posts_count": 246
  },
  {
    "id": 68,
    "name": "Vampire",
    "slug": "vampire",
    "posts_count": 101
  },
  {
    "id": 69,
    "name": "Video Game",
    "slug": "video-game",
    "posts_count": 176
  },
  {
    "id": 70,
    "name": "Visual Arts",
    "slug": "visual-arts",
    "posts_count": 5
  },
  {
    "id": 71,
    "name": "Workplace",
    "slug": "workplace",
    "posts_count": 34
  },
  {
    "id": 72,
    "name": "Urban Fantasy",
    "slug": "urban-fantasy",
    "posts_count": 11
  },
  {
    "id": 73,
    "name": "Villainess",
    "slug": "villainess",
    "posts_count": 6
  },
  {
    "id": 74,
    "name": "Josei",
    "slug": "josei",
    "posts_count": 53
  },
  {
    "id": 75,
    "name": "Kids",
    "slug": "kids",
    "posts_count": 138
  },
  {
    "id": 76,
    "name": "Seinen",
    "slug": "seinen",
    "posts_count": 529
  },
  {
    "id": 77,
    "name": "Shoujo",
    "slug": "shoujo",
    "posts_count": 369
  },
  {
    "id": 78,
    "name": "Shounen",
    "slug": "shounen",
    "posts_count": 1262
  },
  {
    "id": 79,
    "name": "Other",
    "slug": "other",
    "posts_count": 0
  }
];

export function mergeGenreOptions(primary, anime = ANIME_GENRES) {
  const merged = new Map();
  for (const item of primary) {
    const slug = genreKey(item.slug || item.name);
    if (!slug) continue;
    const option = merged.get(slug) || { name: item.name, slug, primarySlugs: [], anime47Ids: [] };
    option.primarySlugs.push(item.slug);
    merged.set(slug, option);
  }
  for (const item of anime) {
    const slug = genreKey(item.slug || item.name);
    if (!slug || !Number.isInteger(Number(item.id))) continue;
    const option = merged.get(slug) || { name: item.name, slug, primarySlugs: [], anime47Ids: [] };
    option.anime47Ids.push(Number(item.id));
    merged.set(slug, option);
  }
  return [...merged.values()].sort((a,b) => a.name.localeCompare(b.name, 'vi'));
}
export function matchesGenre(item, category) {
  return (item.genres || []).some(value => genreKey(value) === genreKey(category));
}
