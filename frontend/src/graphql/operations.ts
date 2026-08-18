import { gql } from '@apollo/client';

export const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken
      tokenType
      user {
        id
        email
        isActive
      }
    }
  }
`;

export const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      isActive
    }
  }
`;

export const COMPANIES_QUERY = gql`
  query GetCompanies {
    companies {
      id
      ticker
      name
      sector
    }
  }
`;

export const CATALYST_EVENTS_QUERY = gql`
  query GetCatalystEvents(
    $limit: Int = 100, 
    $offset: Int = 0, 
    $tier: String, 
    $status: String, 
    $category: String, 
    $searchQuery: String
  ) {
    catalystEvents(
      limit: $limit, 
      offset: $offset, 
      tier: $tier, 
      status: $status, 
      category: $category, 
      searchQuery: $searchQuery
    ) {
      id
      ticker
      companyId
      companyName
      eventTitle
      eventType
      category
      impactScore
      earlyScore
      confidence
      status
      tier
      matchStatus
      whyItMatters
      reactionPct
      relativeVolume
      gapReactionPct
      sessionReactionPct
      reaction1d
      reaction3d
      reaction5d
      preEventPrice
      marketCapAtEvent
      sectorAtEvent
      publishedAt
      detectedAt
      verifiedAt
      createdAt
      updatedAt
      sources {
        id
        sourceName
        url
        isPrimary
        publishedAt
      }
    }
  }
`;
