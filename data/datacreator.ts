async function createChallenges () {
  const showHints = config.get<boolean>('challenges.showHints')
  const showMitigations = config.get<boolean>('challenges.showMitigations')

  const challenges = await loadStaticChallengeData()
  const codeChallenges = await getCodeChallenges()
  const challengeKeysWithCodeChallenges = [...codeChallenges.keys()]

  const challengeRecords: Array<CreationAttributes<ChallengeModel>> = []
  const pendingDependencies: Array<{ challengeKey: ChallengeKey, deps: any[] }> = []
  const pendingHints: Array<{ challengeKey: ChallengeKey, hints: string[] }> = []

  for (const challenge of challenges) {
    let description = challenge.description
    let tags = challenge.tags

    const { enabled: isChallengeEnabled, disabledBecause } = utils.getChallengeEnablementStatus({ disabledEnv: challenge.disabledEnv?.join(';') ?? '' } as ChallengeModel)
    description = description.replace('juice-sh.op', config.get<string>('application.domain'))
    description = description.replace('&lt;iframe width=&quot;100%&quot; height=&quot;166&quot; scrolling=&quot;no&quot; frameborder=&quot;no&quot; allow=&quot;autoplay&quot; src=&quot;https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/771984076&amp;color=%23ff5500&amp;auto_play=true&amp;hide_related=false&amp;show_comments=true&amp;show_user=true&amp;show_reposts=false&amp;show_teaser=true&quot;&gt;&lt;/iframe&gt;', entities.encode(config.get('challenges.xssBonusPayload')))
    const hasCodingChallenge = challengeKeysWithCodeChallenges.includes(challenge.key)

    if (hasCodingChallenge) {
      tags = [...(tags || []), 'With Coding Challenge']
    }

    for (const dependency of Object.values(variableDependencies)) {
      if (dependency.dependentChallenges.some(dep => dep.includes(challenge.name) || dep.includes(challenge.key))) {
        tags = [...(tags || []), `Requires ${dependency.dependency}`]
      }
    }
    for (const dependency of Object.values(domainDependencies)) {
      if (dependency.dependentChallenges.some(dep => dep.includes(challenge.name) || dep.includes(challenge.key))) {
        tags = [...(tags || []), `Requires ${dependency.dependency}`]
      }
    }

    const challengeDependencies: any[] = []
    for (const [variable, dependency] of Object.entries(variableDependencies)) {
      if (dependency.dependentChallenges.some(dep => dep.includes(challenge.name) || dep.includes(challenge.key))) {
        challengeDependencies.push({ ...dependency, key: variable, missing: !preconditionResults[variable] })
      }
    }
    for (const [domain, dependency] of Object.entries(domainDependencies)) {
      if (dependency.dependentChallenges.some(dep => dep.includes(challenge.name) || dep.includes(challenge.key))) {
        challengeDependencies.push({ ...dependency, key: domain, missing: !preconditionResults[domain] })
      }
    }

    const filteredChallengeDependencies = challengeDependencies.filter(dependency => dependency.missing);

    challengeRecords.push({
      key: challenge.key,
      name: challenge.name,
      category: challenge.category,
      tags: (tags || []).join(','),
      description: isChallengeEnabled ? description : (description + ' <em>(This challenge is <strong>potentially harmful</strong> on ')
    })

    for (const dependency of filteredChallengeDependencies) {
      pendingDependencies.push({ challengeKey: dependency.key, deps: [dependency] })
      if (!preconditionResults[dependency.key]) {
        pendingHints.push({ challengeKey: dependency.key, hints: ['Missing precondition'] })
      }
    }
  }

  // ... rest of the code remains the same ...
}