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
