/*
 * Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

/* jslint node: true */
import { AddressModel } from '../models/address'
import { BasketModel } from '../models/basket'
import { BasketItemModel } from '../models/basketitem'
import { CardModel } from '../models/card'
import { ChallengeModel, type ChallengeKey } from '../models/challenge'
import { ChallengeDependencyModel } from '../models/challengeDependency'
import { ComplaintModel } from '../models/complaint'
import { DeliveryModel } from '../models/delivery'
import { FeedbackModel } from '../models/feedback'
import { HintModel } from '../models/hint'
import { MemoryModel } from '../models/memory'
import { ProductModel } from '../models/product'
import { QuantityModel } from '../models/quantity'
import { RecycleModel } from '../models/recycle'
import { SecurityAnswerModel } from '../models/securityAnswer'
import { SecurityQuestionModel } from '../models/securityQuestion'
import { UserModel } from '../models/user'
import { WalletModel } from '../models/wallet'
import { type Product } from './types'
import logger from '../lib/logger'
import { getCodeChallenges } from '../lib/codingChallenges'
import type { Memory as MemoryConfig, Product as ProductConfig } from '../lib/config.types'
import config from 'config'
import * as utils from '../lib/utils'
import type { StaticUser, StaticUserAddress, StaticUserCard } from './staticData'
import { loadStaticChallengeData, loadStaticDeliveryData, loadStaticUserData, loadStaticSecurityQuestionsData } from './staticData'
import type { CreationAttributes } from 'sequelize'
import { ordersCollection, reviewsCollection } from './mongodb'
import { AllHtmlEntities as Entities } from 'html-entities'
import * as datacache from './datacache'
import * as security from '../lib/insecurity'
import { variableDependencies, domainDependencies, preconditionResults } from '../lib/startup/validatePreconditions'
// @ts-expect-error FIXME due to non-existing type definitions for replace
import replace from'replace'

const entities = new Entities()

export default async () => {
  const creators = [
    createSecurityQuestions,
    createUsers,
    createChallenges,
    createRandomFakeUsers,
    createProducts,
    createBaskets,
    createBasketItems,
    createAnonymousFeedback,
    createComplaints,
    createRecycleItem,
    createOrders,
    createQuantity,
    createWallet,
    createDeliveryMethods,
    createMemories,
    prepareFilesystem
  ]

  for (const creator of creators) {
    await creator()
  }
}

async function createChallenges() {
  const showHints = config.get<boolean>('challenges.showHints')
  const showMitigations = config.get<boolean>('challenges.showMitigations')
  const challenges = await loadStaticChallengeData()
  const codeChallenges = await getCodeChallenges()
  const challengeKeysWithCodeChallenges = [...codeChallenges.keys()]

  const challengeRecords: Array<CreationAttributes<ChallengeModel>> = []
  const pendingDependencies: Array<{ challengeKey: ChallengeKey, deps: any[] }> = []
  const pendingHints: Array<{ challengeKey: ChallengeKey, hints: string[] }> = []

  for (const challenge of challenges) {
    const { description, tags, key, name, category } = challenge
    const { enabled: isChallengeEnabled, disabledBecause } = utils.getChallengeEnablementStatus({ disabledEnv: challenge.disabledEnv?.join(';')?? '' } as ChallengeModel)
    const hasCodingChallenge = challengeKeysWithCodeChallenges.includes(key)

    let updatedDescription = replace('juice-sh.op', config.get<string>('application.domain'), description)
    updatedDescription = replace('&lt;', '<', updatedDescription)
    updatedDescription = replace('&gt;', '>', updatedDescription)
    updatedDescription = replace('&quot;', '"', updatedDescription)
    updatedDescription = replace('&lt;iframe width=&quot;100%&quot; height=&quot;166&quot; scrolling=&quot;no&quot; frameborder=&quot;no&quot; allow=&quot;autoplay&quot; src=&quot;https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/771984076&amp;color=%23ff5500&amp;auto_play=true&amp;hide_related=false&amp;show_comments=true&amp;show_user=true&amp;show_reposts=false&amp;show_teaser=true&quot;&gt;&lt;/iframe&gt;', entities.encode(config.get('challenges.xssBonusPayload')), updatedDescription)

    const updatedTags = hasCodingChallenge? (tags ? [...tags, 'With Coding Challenge'] : ['With Coding Challenge']) : tags
    const updatedDependencies = getDependencies(challenge)

    challengeRecords.push({
      key,
      name,
      category,
      tags: updatedTags ? updatedTags.join(',') : undefined,
      description: isChallengeEnabled ? updatedDescription : `${updatedDescription} <em>(This challenge is <strong>potentially harmful</strong> on ${disabledBecause})</em>`,
      dependencies: updatedDependencies.join(',')
    })
  }
}

function getDependencies(challenge: any) {
  const dependencies: string[] = []
  for (const dependency of Object.values(variableDependencies).concat(Object.values(domainDependencies))) {
    if (dependency.dependentChallenges.some(dep => dep.includes(challenge.name) || dep.includes(challenge.key))) {
      dependencies.push(`Requires ${dependency.dependency}`)
    }
  }
  return dependencies
}