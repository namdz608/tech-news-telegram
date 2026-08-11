import type { GadgetMessage } from '../types/gadget';
import { TrackedTelegramDeliveryService } from './tracked-telegram-delivery.service';

export class GadgetDeliveryService extends TrackedTelegramDeliveryService<GadgetMessage> {}
