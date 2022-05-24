import { ContractAsk } from '../../../src/entity';

export const prepareOfferData = async (queryBuilder) => {
  await queryBuilder
    .insert()
    .values([
      {
        id: '26c55195-528a-44ee-a025-7e75412e420f',
        status: "active",
        collection_id: 124,
        token_id: 1,
        network: "testnet",
        price: 42880094,
        currency: "2",
        address_from: '5EWRbBjMNq5fLN9YjL11h1AVgwtoRwrYHc5boL2oD347RCfw',
        address_to: '5EWRbBjMNq5fLN9YjL11h1AVgwtoRwrYHc5boL2oD347RCfw',
        block_number_ask: 11011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "3c32578d-123c-4845-b87f-273923565fab",
        status: "active",
        collection_id: 124,
        token_id: 2,
        network: "testnet",
        price: 816045457,
        currency: "2",
        address_from: '5Ek3TXC3z1qNVAii4LQQR5CUijZgemGXB35FAavx3V8WGHha',
        address_to: '5Ek3TXC3z1qNVAii4LQQR5CUijZgemGXB35FAavx3V8WGHha',
        block_number_ask: 10011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "532f48d4-9e4b-46bd-8359-4c9d7dacac97",
        status: "active",
        collection_id: 124,
        token_id: 3,
        network: "testnet",
        price: 901329162,
        currency: "2",
        address_from: '5CqULFyV8rgpy3bd3yJGfyFoPrn2EP46vnn86ey4FP5j4nih',
        address_to: '5CqULFyV8rgpy3bd3yJGfyFoPrn2EP46vnn86ey4FP5j4nih',
        block_number_ask: 9011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "b3810b1e-f76a-4447-839f-e6c5261c2f1e",
        status: "active",
        collection_id: 124,
        token_id: 4,
        network: "testnet",
        price: 254472613,
        currency: "2",
        address_from: '5CqULFyV8rgpy3bd3yJGfyFoPrn2EP46vnn86ey4FP5j4nih',
        address_to: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqm',
        block_number_ask: 8011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "24af1385-ff5f-4567-aa55-80a7653662a9",
        status: "active",
        collection_id: 124,
        token_id: 5,
        network: "testnet",
        price: 734787760,
        currency: "2",
        address_from: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqm',
        address_to: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqm',
        block_number_ask: 7011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "306d181c-0533-4e94-8e5c-a3338f6c9511",
        status: "active",
        collection_id: 124,
        token_id: 6,
        network: "testnet",
        price: 225965342,
        currency: "2",
        address_from: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqq',
        address_to: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqq',
        block_number_ask: 6011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "4724d486-b1c4-4816-961a-844f35e1f613",
        status: "active",
        collection_id: 562,
        token_id: 1,
        network: "testnet",
        price: 670027747,
        currency: "2",
        address_from: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqq',
        address_to: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqq',
        block_number_ask: 5011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "f047d7a5-1ba4-42c6-bac3-0dd9c2b6d13f",
        status: "active",
        collection_id: 562,
        token_id: 2,
        network: "testnet",
        price: 100,
        currency: "2",
        address_from: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqm',
        address_to: '',
        block_number_ask: 4011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "15d9ca2e-a84b-4884-b382-995d43232df9",
        status: "active",
        collection_id: 1782,
        token_id: 1,
        network: "testnet",
        price: 289621044,
        currency: "2",
        address_from: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqq',
        address_to: '',
        block_number_ask: 3011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "15cdb536-6027-4559-8d48-164ce93a7c5f",
        status: "active",
        collection_id: 1782,
        token_id: 2,
        network: "testnet",
        price: 409586855,
        currency: "2",
        address_from: '5CqULFyV8rgpy3bd3yJGfyFoPrn2EP46vnn86ey4FP5j4nih',
        address_to: '',
        block_number_ask: 2011,
        block_number_cancel: null,
        block_number_buy: null
      },
      {
        id: "dd63dce7-7a4d-4f07-bdb0-31dfb288222e",
        status: "active",
        collection_id: 1782,
        token_id: 3,
        network: "testnet",
        price: 436581111,
        currency: "2",
        address_from: '5DcJgDMWhg6NP3QEvikFnuyjdtXc42YznBiJJWqb93SAmzqm',
        address_to: '',
        block_number_ask: 1011,
        block_number_cancel: null,
        block_number_buy: null
      }
    ])
    .into(ContractAsk)
    .execute()
}