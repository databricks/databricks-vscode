# A fake Spark Connect server for the mock workspace: enough of the protocol
# for `spark.sql('SELECT "<text>"').toPandas()` through databricks-connect.
# Plain h2c on 127.0.0.1:15002 (MOCK_SPARK_PORT); server.mjs terminates TLS and forwards gRPC.
import io
import os
import re
import sys
import uuid
from concurrent import futures

import grpc
import pyarrow as pa
from pyspark.sql.connect.proto import base_pb2, base_pb2_grpc, relations_pb2, types_pb2

LOG = open(os.path.join(os.environ.get("MOCK_DIR", "/tmp/databricks-vscode-e2e-mock"), "spark_connect.log"), "a", buffering=1)


def log(*a):
    print(*a, file=LOG)


SQL = {}  # relation id -> query


def query_of(relation):
    kind = relation.WhichOneof("rel_type")
    if kind == "sql":
        return relation.sql.query
    if kind == "with_relations":
        return query_of(relation.with_relations.root)
    for field in ("input",):
        pass
    return None


def table_for(query):
    texts = re.findall(r"SELECT\s+[\"']([^\"']*)[\"']", query or "", re.I)
    text = texts[0] if texts else "hello world"
    return pa.table({text: [text]})


def arrow_bytes(table):
    sink = io.BytesIO()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return sink.getvalue()


def data_type(table):
    fields = [types_pb2.DataType.StructField(name=f.name, data_type=types_pb2.DataType(string=types_pb2.DataType.String()), nullable=True) for f in table.schema]
    return types_pb2.DataType(struct=types_pb2.DataType.Struct(fields=fields))


class Service(base_pb2_grpc.SparkConnectServiceServicer):
    def __init__(self):
        self.server_session = str(uuid.uuid4())

    def _base(self, request, operation_id):
        return dict(session_id=request.session_id, server_side_session_id=self.server_session, operation_id=operation_id)

    def ExecutePlan(self, request, context):
        op = request.operation_id or str(uuid.uuid4())
        plan = request.plan
        kind = plan.WhichOneof("op_type")
        log("ExecutePlan", kind, str(plan)[:400].replace("\n", " "))
        base = self._base(request, op)
        if kind == "command":
            command = plan.command
            ck = command.WhichOneof("command_type")
            if ck == "sql_command":
                sql = command.sql_command
                query = sql.sql or (sql.input.sql.query if sql.HasField("input") else "")
                relation = relations_pb2.Relation(sql=relations_pb2.SQL(query=query))
                yield base_pb2.ExecutePlanResponse(response_id=str(uuid.uuid4()), sql_command_result=base_pb2.ExecutePlanResponse.SqlCommandResult(relation=relation), **base)
        else:
            table = table_for(query_of(plan.root))
            yield base_pb2.ExecutePlanResponse(response_id=str(uuid.uuid4()), schema=data_type(table), **base)
            yield base_pb2.ExecutePlanResponse(
                response_id=str(uuid.uuid4()), arrow_batch=base_pb2.ExecutePlanResponse.ArrowBatch(row_count=table.num_rows, data=arrow_bytes(table)), **base
            )
        yield base_pb2.ExecutePlanResponse(response_id=str(uuid.uuid4()), result_complete=base_pb2.ExecutePlanResponse.ResultComplete(), **base)

    def AnalyzePlan(self, request, context):
        kind = request.WhichOneof("analyze")
        log("AnalyzePlan", kind)
        response = base_pb2.AnalyzePlanResponse(session_id=request.session_id, server_side_session_id=self.server_session)
        if kind == "spark_version":
            response.spark_version.version = "4.0.0"
            response.spark_version.dbr_version = "99.0.x-scala2.13"
        elif kind == "schema":
            response.schema.schema.CopyFrom(data_type(table_for(query_of(request.schema.plan.root))))
        elif kind == "is_streaming":
            response.is_streaming.is_streaming = False
        return response

    def Config(self, request, context):
        op = request.operation
        log("Config", str(op)[:300].replace("\n", " "))
        response = base_pb2.ConfigResponse(session_id=request.session_id, server_side_session_id=self.server_session)
        kind = op.WhichOneof("op_type")
        keys = []
        if kind in ("get", "get_with_default", "get_option"):
            sub = getattr(op, kind)
            keys = [p.key for p in sub.pairs] if kind == "get_with_default" else list(sub.keys)
            defaults = {p.key: p.value for p in sub.pairs} if kind == "get_with_default" else {}
            known = {"spark.sql.session.timeZone": "UTC"}
            for key in keys:
                pair = response.pairs.add(key=key)
                value = known.get(key, defaults.get(key))
                if value is not None:
                    pair.value = value
        return response

    def ReattachExecute(self, request, context):
        log("ReattachExecute")
        yield base_pb2.ExecutePlanResponse(response_id=str(uuid.uuid4()), result_complete=base_pb2.ExecutePlanResponse.ResultComplete(), **self._base(request, request.operation_id))

    def ReleaseExecute(self, request, context):
        log("ReleaseExecute")
        return base_pb2.ReleaseExecuteResponse(session_id=request.session_id, server_side_session_id=self.server_session, operation_id=request.operation_id)

    def ReleaseSession(self, request, context):
        log("ReleaseSession")
        return base_pb2.ReleaseSessionResponse(session_id=request.session_id, server_side_session_id=self.server_session)

    def Interrupt(self, request, context):
        return base_pb2.InterruptResponse(session_id=request.session_id, server_side_session_id=self.server_session)


def main():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    base_pb2_grpc.add_SparkConnectServiceServicer_to_server(Service(), server)
    port = os.environ.get("MOCK_SPARK_PORT", "15002")
    server.add_insecure_port(f"127.0.0.1:{port}")
    server.start()
    log(f"listening on {port}")
    server.wait_for_termination()


if __name__ == "__main__":
    sys.exit(main())
