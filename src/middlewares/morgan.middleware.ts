import Morgan from 'morgan';

import { logger } from '../utils/logger';

const morganMiddleware = Morgan(
  (tokens: any, req: any, res: any) => {
    if ((tokens.method(req, res) === 'GET' && req.path.includes('/event/nft') === true) === false) {
      if (req.path.includes('/requests') === false) {
        return ['📘[ END ]', tokens.method(req, res), tokens.url(req, res), tokens.status(req, res)].join(' ');
      }
    }
  },
  {
    stream: {
      write: (message: string) => {
        logger.debug(message.substring(0, message.lastIndexOf('\n')));
      },
    },
  }
);

export default morganMiddleware;
