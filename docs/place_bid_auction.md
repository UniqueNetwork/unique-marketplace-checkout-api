## Place bid

Placing a bid an auction


### How to get "signature" and "signerPayloadJSON" ?
The application communicates through the [Unique SDK](https:www.npmjs.compackage@unique-nftsdk) package and all transactions with are made at the expense of the SDK.

There are two options for getting **signature** and **signerPayloadJSON**:
* First option, if you have the **Seed phrase**, you can get **signerPayloadJSON** and **signature** from the Unique SDK application via _**sdk.tokens.transfer.sign**_
* Second option, **without the Seed phrase**, using the _**sdk.tokens.transfer.build**_ method and then get the **signature** from the **signerPayloadJSON** option

In the example below, we will show in the first example how to get **signature** and **signerPayloadJSON** for an auction.

An example is translated below in the _Method for receiving data through a script_ section

<details>
<summary>Method for receiving data through a script (readme)</summary>

## Getting data

Here we will provide an example of how to get data for a transaction and a signature.
You will need the following input:

    * Mnemonic phrase (seed) - 12 words phrase;
    * Collection ID
    * Token ID
    * Substrate address (the address of the auction)

> ⚠️WARNING!!! ⚠️
> Do not share the mnemonic phrase with anybody as this phrase is all that’s needed for someone to obtain access to the funds and NFTs that are stored on this account.
> Note down the address of the newly created accounts. It will be used in the upcoming steps and will be referred to as the SEED.

Example:

```
    import { createSigner } from '@unique-nft/sdk/sign';
    import { Sdk } from '@unique-nft/sdk';
    import { getAccountFromMnemonic } from '@unique-nft/accounts';
```
Your seed and auction address
```
    const auctionSubstrateAddress = 'unjKJQJrRd238pkUZZvzDQrfKuM39zBSnQ5zjAGAGcdRhaJTx';
    const mnemonic = 'your mnemonic phrase'; // 12 words phrase;
```
Create connection to the blockchain
```
    const sdk = await Sdk.create({
        chainWsUrl: 'wss://quartz.unique.network',
        signer: await createSigner({
            seed: mnemonic, // Signer seed phrase if you want to sign extrinsics
        }),
    });
```
Get account from mnemonic phrase (seed). Get the Substrate address
```
    const account = await getAccountFromMnemonic({
        mnemonic,
    });
```
Arguments for the transaction to create an auction
```
    const args = {
        collectionId: 1, // Collection ID
        tokenId: 7, // Token ID
        address: account.address, // Substrate address (the address from which you auction tokens)
        from: account.address, // Substrate address (the address from which you auction tokens)
        to: auctionSubstrateAddress, // Substrate address (the address of the auction)
        value: 1
    }
```
Getting the signature and signature for the transaction
```
    const {signature, signerPayloadJSON } = await sdk.tokens.transfer.sign(args);

```
</details>

You can see the full documentation for the Unique SDK here: [Github Unique SDK](https://github.com/UniqueNetwork/unique-sdk)
