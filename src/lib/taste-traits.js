/** Fixed, spoiler-safe vocabulary. Labels never come from reviews. Rules recognize
 * explicit descriptions, not latent intent, production quality from a synopsis,
 * or the viewer's reason for liking a particular character. */
export const TASTE_VERSION = 2;
const trait = (key, label, pattern, source = "both", opposite = "") => ({
  key,
  label,
  pattern,
  source,
  opposite,
});
export const TASTE_TRAITS = [
  trait(
    "animation-craft",
    "well-executed animation",
    /\b((?:excellent|impressive|beautiful|great|amazing|superb) animation|animation (?:is|looks|feels) (?:excellent|impressive|beautiful|great|amazing|superb))\b/i,
    "review",
  ),
  trait(
    "visual-direction",
    "expressive visual direction",
    /\b((?:inventive|expressive|striking|cinematic) (?:visual direction|cinematography|shot composition)|(?:visual direction|cinematography) (?:is|looks) (?:inventive|expressive|striking|excellent))\b/i,
    "review",
  ),
  trait(
    "realistic-design",
    "realistic character designs",
    /\b(realistic character designs?|realistically drawn characters)\b/i,
    "review",
  ),
  trait(
    "exaggerated-design",
    "exaggerated character designs",
    /\b(exaggerated character designs?|cartoonish character designs?)\b/i,
    "review",
  ),
  trait(
    "cg-animation",
    "CG animation",
    /\b((?:3d|cg|cgi|computer.generated) animation|fully computer.animated)\b/i,
    "review",
  ),
  trait(
    "jazz-music",
    "jazz-influenced music",
    /\b(jazz (?:music|soundtrack|score)|jazzy (?:music|soundtrack|score)|jazz.influenced soundtrack)\b/i,
    "review",
  ),
  trait(
    "rock-music",
    "rock-driven music",
    /\b(rock (?:soundtrack|score)|rock.driven music)\b/i,
    "review",
  ),
  trait(
    "electronic-music",
    "electronic music",
    /\b(electronic (?:music|soundtrack|score)|synth.driven soundtrack)\b/i,
    "review",
  ),
  trait(
    "soundtrack-craft",
    "a memorable soundtrack",
    /\b((?:memorable|excellent|outstanding|great|amazing) soundtrack|soundtrack (?:is|sounds) (?:memorable|excellent|outstanding|great|amazing))\b/i,
    "review",
  ),
  trait(
    "consistent-writing",
    "consistent writing",
    /\b(consistent writing|consistently written|writing (?:is|remains) consistent)\b/i,
    "review",
    "uneven-writing",
  ),
  trait(
    "uneven-writing",
    "uneven writing",
    /\b(inconsistent writing|uneven writing|writing (?:is|feels) (?:uneven|inconsistent))\b/i,
    "review",
    "consistent-writing",
  ),
  trait(
    "repetitive-story",
    "repetitive storytelling",
    /\b(repetitive (?:storytelling|plot|story)|(?:plot|story) (?:is|feels|becomes) repetitive)\b/i,
    "review",
  ),
  trait(
    "filler-heavy",
    "frequent filler episodes",
    /\b(frequent filler|filler.heavy|lots of filler|many filler episodes)\b/i,
    "review",
  ),
  trait(
    "emotional-resonance",
    "strong emotional impact",
    /\b(strong emotional (?:impact|resonance)|emotionally (?:moving|resonant|powerful))\b/i,
    "review",
  ),
  trait(
    "team-dynamics",
    "teamwork and group dynamics",
    /\b(team dynamics|group dynamics|teamwork and (?:trust|friendship))\b/i,
  ),
  trait(
    "interpersonal-drama",
    "interpersonal drama",
    /\b(interpersonal (?:drama|conflicts)|complicated family relationships)\b/i,
  ),

  trait(
    "moral-ambiguity",
    "morally complicated characterization",
    /\b(morally (?:complex|gray|grey|ambiguous) characters|moral ambiguity)\b/i,
  ),
  trait(
    "subtext",
    "subtle, layered characterization",
    /\b(layered subtext|subtle characterization|implicit character motivations)\b/i,
    "review",
  ),
  trait(
    "ironic-humor",
    "ironic humor",
    /\b(ironic humo[u]?r|irony.driven comedy)\b/i,
    "review",
  ),
  trait(
    "absurd-humor",
    "absurdist humor",
    /\b(absurdist (?:humo[u]?r|comedy)|surreal comedy)\b/i,
  ),
  trait("dark-humor", "dark humor", /\b(dark humo[u]?r|black comedy)\b/i),
  trait(
    "episodic-style",
    "self-contained episodes",
    /\b(episodic storytelling|self.contained episodes)\b/i,
  ),
  trait(
    "gradual-romance",
    "gradual romantic development",
    /\b(slow.burn romance|gradual romantic development)\b/i,
  ),

  trait(
    "strategic-action",
    "tactical battles and clever solutions",
    /\b(strategic (?:battles|combat)|tactical (?:battles|combat)|mind games|outwitting (?:their |his |her )?(?:opponents|enemies))\b/i,
  ),
  trait(
    "power-fantasy",
    "power-fantasy action",
    /\b(power fantasy|overpowered (?:hero|protagonist|lead))\b/i,
  ),
  trait(
    "competent-lead",
    "capable, resourceful leads",
    /\b((?:competent|resourceful|highly skilled) (?:lead|protagonist|hero)|(?:lead|protagonist|hero) (?:is|remains) (?:competent|resourceful|highly skilled))\b/i,
  ),
  trait(
    "flawed-lead",
    "flawed protagonists",
    /\b((?:flawed|imperfect) (?:protagonist|lead|hero))\b/i,
  ),
  trait(
    "ensemble",
    "an ensemble of central characters",
    /\b(ensemble cast|ensemble story|multiple protagonists)\b/i,
  ),
  trait(
    "adult-cast",
    "stories centered on adults",
    /\b(adult cast|adult protagonists|middle.aged protagonist)\b/i,
  ),
  trait(
    "character-focus",
    "character-focused storytelling",
    /\b(character.driven|character.focused|character study)\b/i,
  ),
  trait(
    "plot-focus",
    "plot-focused storytelling",
    /\b(plot.driven|plot.focused)\b/i,
  ),
  trait(
    "serialized",
    "a continuous, connected story",
    /\b(serialized (?:story|narrative|storytelling)|continuous (?:story|narrative))\b/i,
  ),
  trait(
    "worldbuilding",
    "detailed worldbuilding",
    /\b((?:rich|detailed|extensive|intricate) world.?building)\b/i,
  ),
  trait(
    "philosophy",
    "philosophical questions",
    /\b(philosophical (?:themes|questions|exploration)|existential (?:themes|questions))\b/i,
  ),
  trait(
    "identity",
    "questions of identity and belonging",
    /\b(search for (?:identity|belonging)|struggles? with (?:their |his |her )?identity|identity crisis)\b/i,
    "synopsis",
  ),
  trait(
    "ambition",
    "the pursuit of a demanding ambition",
    /\b(relentless ambition|pursuit of (?:success|greatness)|ambitious (?:goal|dream))\b/i,
    "synopsis",
  ),
  trait(
    "justice",
    "questions about justice",
    /\b(questions? (?:of|about) justice|pursuit of justice|meaning of justice)\b/i,
    "synopsis",
  ),
  trait(
    "villain-charisma",
    "charismatic antagonists",
    /\b(charismatic (?:villains?|antagonists?))\b/i,
    "both",
  ),
  trait(
    "villain-strategy",
    "calculating antagonists",
    /\b((?:calculating|scheming|cunning) (?:villains?|antagonists?))\b/i,
    "both",
  ),
  trait(
    "villain-menace",
    "intimidating antagonists",
    /\b((?:menacing|intimidating|terrifying) (?:villains?|antagonists?))\b/i,
    "both",
  ),
  trait(
    "romantic-chemistry",
    "romantic chemistry",
    /\b((?:strong|convincing|believable|great) romantic chemistry)\b/i,
    "review",
  ),
  trait("romcom", "romantic comedy", /\b(romantic comedy|rom.com)\b/i),
  trait("banter", "playful banter", /\b((?:witty|playful|sharp) banter)\b/i),
  trait(
    "dry-humor",
    "dry humor",
    /\b(dry (?:humor|humour|wit)|deadpan (?:comedy|humor|humour))\b/i,
  ),
  trait(
    "slapstick",
    "physical, slapstick comedy",
    /\b(slapstick(?: comedy)?|physical comedy)\b/i,
  ),
  trait(
    "satire",
    "satirical humor",
    /\b(satirical (?:comedy|humor|humour)|social satire)\b/i,
  ),
  trait(
    "parody",
    "parody and genre send-ups",
    /\b(genre parody|parody comedy|parodies (?:the |a )?genre)\b/i,
  ),
  trait(
    "comfort",
    "a comforting atmosphere",
    /\b(comforting (?:atmosphere|story|tone)|cozy (?:atmosphere|story)|healing (?:anime|story))\b/i,
  ),
  trait(
    "hopeful",
    "an optimistic tone",
    /\b(hopeful (?:tone|story)|optimistic (?:tone|outlook)|uplifting (?:story|tone))\b/i,
  ),
  trait(
    "melancholy",
    "a melancholic atmosphere",
    /\b(melancholic (?:tone|atmosphere)|melancholy atmosphere)\b/i,
  ),
  trait(
    "tension",
    "sustained psychological tension",
    /\b(psychological tension|sustained suspense|slow.building tension)\b/i,
  ),
  trait(
    "bleak",
    "a bleak atmosphere",
    /\b(bleak (?:tone|atmosphere|world)|oppressive atmosphere)\b/i,
  ),
  trait(
    "weird",
    "experimental, unconventional storytelling",
    /\b(experimental (?:storytelling|narrative)|unconventional storytelling)\b/i,
  ),
  trait(
    "dense",
    "dense, demanding storytelling",
    /\b(dense (?:plot|storytelling|narrative)|complex narrative structure)\b/i,
  ),
  trait(
    "accessible",
    "straightforward storytelling",
    /\b(straightforward (?:storytelling|narrative|plot)|easy.to.follow (?:story|plot))\b/i,
  ),
  trait(
    "slow-burn",
    "slow-burn storytelling",
    /\b(slow.burn (?:story|narrative|storytelling|thriller)|deliberately paced)\b/i,
  ),
  trait(
    "brisk",
    "brisk pacing",
    /\b(brisk pacing|fast.paced storytelling|snappy pacing)\b/i,
    "review",
  ),
  trait(
    "uneven-pacing",
    "uneven pacing",
    /\b(uneven pacing|inconsistent pacing|pacing (?:is|feels) uneven)\b/i,
    "review",
  ),
  trait(
    "martial-arts",
    "martial-arts combat",
    /\b(martial.arts (?:combat|battles|fights)|hand.to.hand combat)\b/i,
  ),
  trait(
    "swordplay",
    "sword-based action",
    /\b(swordplay|sword.fighting|sword duels)\b/i,
  ),
  trait("gunplay", "gun-based action", /\b(gunplay|gunfights|gun battles)\b/i),
  trait(
    "cyberpunk",
    "cyberpunk settings",
    /\b(cyberpunk (?:world|setting|city)|cybernetic dystopia)\b/i,
  ),
  trait(
    "urban-fantasy",
    "fantasy within a modern city",
    /\b(urban fantasy|modern.day (?:city|world).{0,35}magic)\b/i,
  ),
  trait(
    "rural",
    "rural settings",
    /\b(rural (?:village|town|setting)|countryside (?:village|life))\b/i,
  ),
  trait(
    "cooking",
    "cooking and culinary craft",
    /\b(culinary (?:arts|ambition|competition)|cooking (?:competition|skills)|aspiring chef)\b/i,
  ),
  trait(
    "performance",
    "stage performance and creative ambition",
    /\b(aspiring (?:actor|dancer)|theater troupe|theatre troupe|performing arts)\b/i,
  ),
  trait(
    "art-making",
    "art and creative work",
    /\b(aspiring (?:artist|manga artist)|art school|creative process)\b/i,
  ),
  trait(
    "fluid-animation",
    "fluid animation",
    /\b(fluid (?:and smooth )?animation|smooth (?:and fluid )?animation|animation (?:is|looks|feels) (?:very |extremely |remarkably )?(?:fluid|smooth))\b/i,
    "review",
    "limited-animation",
  ),
  trait(
    "limited-animation",
    "limited or stiff animation",
    /\b(stiff animation|limited animation|animation (?:is|looks|feels) (?:stiff|wooden))\b/i,
    "review",
    "fluid-animation",
  ),
  trait(
    "expressive-animation",
    "expressive character animation",
    /\b(expressive (?:character animation|character acting|facial animation))\b/i,
    "review",
  ),
  trait(
    "choreography",
    "elaborate action choreography",
    /\b((?:intricate|elaborate|excellent|impressive|well.executed) (?:fight|action) choreography)\b/i,
    "review",
  ),
  trait(
    "bold-color",
    "bold, vivid colors",
    /\b((?:vibrant|bold|vivid) colo[u]?r (?:palette|scheme)|vibrant colo[u]?rs)\b/i,
    "review",
  ),
  trait(
    "muted-color",
    "muted color palettes",
    /\b(muted colo[u]?rs?|muted palette|subdued colo[u]?r palette)\b/i,
    "review",
  ),
  trait(
    "detailed-background",
    "detailed background art",
    /\b((?:detailed|intricate|richly painted) backgrounds?|detailed background art)\b/i,
    "review",
  ),
  trait(
    "minimalist-art",
    "minimalist visual design",
    /\b(minimalist (?:art|visuals|design)|minimalistic art)\b/i,
    "review",
  ),
  trait(
    "stylized-art",
    "stylized visual design",
    /\b(highly stylized (?:art|visuals|design)|stylized character designs)\b/i,
    "review",
  ),
  trait(
    "retro-art",
    "retro visual design",
    /\b(retro (?:art style|visuals|character designs))\b/i,
    "review",
  ),
  trait(
    "atmospheric-music",
    "atmospheric music",
    /\b(atmospheric (?:music|soundtrack|score))\b/i,
    "review",
  ),
  trait(
    "energetic-music",
    "energetic music",
    /\b(energetic (?:music|soundtrack|score))\b/i,
    "review",
  ),
  trait(
    "orchestral-music",
    "orchestral music",
    /\b(orchestral (?:music|soundtrack|score))\b/i,
    "review",
  ),
  trait(
    "voice-performance",
    "expressive voice performances",
    /\b((?:expressive|convincing|excellent|strong) voice (?:acting|performances?))\b/i,
    "review",
  ),
  trait(
    "sound-design",
    "detailed sound design",
    /\b((?:detailed|immersive|excellent|inventive) sound design)\b/i,
    "review",
  ),
  trait(
    "natural-dialogue",
    "natural-sounding dialogue",
    /\b((?:natural|believable|convincing) dialogue)\b/i,
    "review",
    "stilted-dialogue",
  ),
  trait(
    "stilted-dialogue",
    "stilted dialogue",
    /\b((?:stilted|wooden|awkward) dialogue)\b/i,
    "review",
    "natural-dialogue",
  ),
  trait(
    "character-depth",
    "layered characterization",
    /\b((?:layered|nuanced|multidimensional|well.developed) characters|(?:strong|convincing) character development)\b/i,
    "review",
    "flat-characters",
  ),
  trait(
    "flat-characters",
    "simple, lightly developed characters",
    /\b((?:flat|one.dimensional|underdeveloped) characters)\b/i,
    "review",
    "character-depth",
  ),
  trait(
    "comic-timing",
    "sharp comic timing",
    /\b((?:sharp|excellent|great|precise) comic timing)\b/i,
    "review",
  ),
  trait(
    "emotional-intensity",
    "emotionally intense storytelling",
    /\b(emotionally intense|emotional intensity|emotionally demanding)\b/i,
  ),
  trait(
    "gore",
    "graphic violence",
    /\b(graphic violence|graphic gore|gory violence)\b/i,
  ),
  trait(
    "fanservice",
    "frequent sexual fanservice",
    /\b((?:heavy|frequent|excessive) (?:sexual )?fan.?service)\b/i,
  ),
];
export const TRAIT_BY_KEY = new Map(TASTE_TRAITS.map((t) => [t.key, t]));

/** Conservative clause handling: omit negation, comparisons and overt sarcasm.
 * Ambiguous prose is unknown. This does not claim to understand irony. */
export function evidenceClauses(text) {
  return String(text || "")
    .slice(0, 24000)
    .replace(/<[^>]*>/g, " ")
    .split(/(?<=[.!?;])\s+|\n+|\bbut\b|\bhowever\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 700)
    .filter(
      (s) =>
        !/\b(no|not|never|without|neither|unlike|hardly|barely|lacks?|lacking|isn't|isn’t|wasn't|wasn’t|sarcasm|sarcastic|supposedly|allegedly)\b|rather than|compared (?:to|with)|better than|worse than|yeah right|as if|so.called|i wish|could have|would have/i.test(
          s,
        ),
    );
}
export function synopsisTraits(anime) {
  const clauses = evidenceClauses(anime.synopsis);
  const result = new Map();
  for (const t of TASTE_TRAITS) {
    if (t.source === "review") continue;
    const matches = clauses.filter((s) => t.pattern.test(s));
    if (matches.length)
      result.set(t.key, {
        description: t.label,
        sentence: matches[0],
        source: "synopsis",
        strength: 0.5 + (0.5 * matches.length) / Math.max(1, clauses.length),
      });
  }
  return result;
}
/** Treat all remotely/imported metadata as untrusted; only the fixed vocabulary
 * can reach the model or explanation. No review text, names, or URLs survive. */
export function reviewTraits(anime) {
  const profile = anime.reviewTaste;
  const result = new Map();
  if (profile?.version !== TASTE_VERSION || !Array.isArray(profile.traits))
    return result;
  for (const value of profile.traits.slice(0, TASTE_TRAITS.length)) {
    const t = TRAIT_BY_KEY.get(value?.key);
    if (
      !t ||
      t.source === "synopsis" ||
      !Number.isInteger(value.support) ||
      value.support < 3 ||
      !Number.isFinite(value.strength) ||
      value.strength <= 0 ||
      value.strength > 1
    )
      continue;
    result.set(t.key, {
      description: t.label,
      strength: value.strength,
      support: value.support,
      source: "reviews",
    });
  }
  return result;
}
export function reviewFeatures(anime) {
  const traits = reviewTraits(anime);
  const norm = Math.sqrt(traits.size) || 1;
  const features = [...traits].map(([key, value]) => [
    "review:" + key,
    (0.65 * value.strength) / norm,
  ]);
  return { traits, features };
}
