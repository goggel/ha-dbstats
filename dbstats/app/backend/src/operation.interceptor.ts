import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, lastValueFrom } from 'rxjs';
import { QueryGateway } from './query-gateway';

/** Subscription starts inside the context so all nested service calls share it. */
@Injectable()
export class OperationInterceptor implements NestInterceptor {
  constructor(private readonly gateway: QueryGateway) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metricId = `${context.getClass().name}.${context.getHandler().name}`;
    return new Observable((subscriber) => {
      void this.gateway
        .runOperation(() => lastValueFrom(next.handle()))
        .then(
          (value) => {
            subscriber.next(value);
            subscriber.complete();
          },
          (error) => {
            if (error instanceof HttpException) {
              const response = error.getResponse();
              if (typeof response === 'object') {
                error = new HttpException(
                  { ...response, metricId },
                  error.getStatus(),
                );
              }
            }
            subscriber.error(error);
          },
        );
    });
  }
}
