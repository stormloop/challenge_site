import mimetypes
mimetypes.init()

def get_file_type(filename: str):
    mimestart = mimetypes.guess_type(filename)[0]

    if mimestart != None:
        return mimestart.split('/')[0]
    return "_COULD_NOT_FIND_FILE_TYPE_"