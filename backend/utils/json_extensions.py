from datetime import datetime
import json

from pydantic import BaseModel


class CustomEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, set):
            return { 'type':'set', 'list':list(obj) }  # encode as a dict containing the set as a list.
        if isinstance(obj, BaseModel):
            return obj.model_dump()
        if isinstance(obj, datetime):
            return { 'type':'datetime', 'value':obj.strftime('%d/%m/%Y %H:%M:%S UTC') }
        return json.JSONEncoder.default(self, obj)

class CustomDecoder(json.JSONDecoder):
    def __init__(self, *args, **kwargs):
        json.JSONDecoder.__init__(self, object_hook=self.object_hook, *args, **kwargs)

    def object_hook(self, dct):
        if 'type' in dct and dct['type'] == 'set' and 'list' in dct:
            return set(dct['list'])
        if 'type' in dct and dct['type'] == 'datetime' and 'value' in dct:
            return datetime.strptime(dct['value'], '%d/%m/%Y %H:%M:%S UTC')
        return dct