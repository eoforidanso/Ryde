import type { ProductId } from '../data/products';
import { IconBike, IconCar, IconTricycle, IconUsers, IconVan } from './Icons';

export function ProductIcon({ id, size = 26 }: { id: ProductId; size?: number }) {
  const props = { width: size, height: size };
  switch (id) {
    case 'okada':
      return <IconBike {...props} />;
    case 'aboboya':
      return <IconTricycle {...props} />;
    case 'xl':
      return <IconVan {...props} />;
    case 'share':
      return <IconUsers {...props} />;
    default:
      return <IconCar {...props} />;
  }
}
