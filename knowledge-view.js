// One shape for the knowledge payload, shared by the running server and the
// static Pages build. The stored file uses snake_case and nests a few fields
// under names the frontend does not use, so both callers must agree on the
// reshaped result or the site renders empty on one of them.
export function knowledgeView(knowledge) {
  const races = knowledge.races || {};
  const classes = knowledge.classes || {};
  return {
    chat: knowledge.chat,
    rules: knowledge.rules,
    lore: knowledge.lore,
    races: {
      list: races.list,
      links: races.links || {},
      relations: races.relations,
      rules: races.race_template_rules,
      fields: races.race_template_fields,
      templateLink: races.template_link || '',
      blogLink: races.blog_link || '',
      playerBlogLink: races.player_blog_link || '',
      playerRaces: races.player_races || []
    },
    classes: {
      ...classes,
      playerBlogLink: classes.player_blog_link || '',
      playerClasses: classes.player_classes || []
    },
    characterTemplate: knowledge.character_template,
    storyTemplate: knowledge.story_template || '',
    entryProcess: knowledge.entry_process,
    administration: knowledge.administration
  };
}
