import { SearchIndex } from '@app/entity';
import { TypeAttributToken } from '@app/types';
import { TokenDescriptionDto } from '@app/offers/dto';

export function parseSearchIndex(): (
  previousValue: { attributes: any[] },
  currentValue: Partial<SearchIndex>,
  currentIndex: number,
  array: Partial<SearchIndex>[],
) => { attributes: any[] } {
  const types = [TypeAttributToken.String, TypeAttributToken.Enum];

  return (acc, item) => {
    if (item.type === TypeAttributToken.Prefix) {
      acc['prefix'] = item.items.pop();
    }

    if (item.key === 'collectionName') {
      acc['collectionName'] = item.items.pop();
    }

    if (item.key === 'description') {
      acc['description'] = item.items.pop();
    }

    if (item.type === TypeAttributToken.ImageURL) {
      const image = String(item.items.pop());
      if (image.search('ipfs.uniquenetwork.dev') !== -1) {
        acc[`${item.key}`] = image;
      } else {
        if (image.search('https://') !== -1 && image.search('http://') !== 0) {
          acc[`${item.key}`] = image;
        } else {
          if (image) {
            acc[`${item.key}`] = `https://ipfs.uniquenetwork.dev/ipfs/${image}`;
          } else {
            acc[`${item.key}`] = null;
          }
        }
      }
    }

    if (item.type === TypeAttributToken.VideoURL) {
      const video = String(item.items.pop());
      acc[`${item.key}`] = video;
    }

    if (types.includes(item.type) && !['collectionName', 'description'].includes(item.key)) {
      acc.attributes.push({
        key: item.key,
        value: item.items.length === 1 ? item.items.pop() : item.items,
        type: item.type,
      });
    }
    return acc;
  };
}

export function getTokenDescription(searchIndex: SearchIndex[], collectionId: string, tokenId: string): TokenDescriptionDto {
  return searchIndex
    .filter((index) => index.collection_id === collectionId && index.token_id === tokenId)
    .reduce(parseSearchIndex(), {
      attributes: [],
    }) as TokenDescriptionDto;
}
