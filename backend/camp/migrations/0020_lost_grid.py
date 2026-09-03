from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('camp', '0019_lesson_qa_enabled_lessonquestion'), ('users', '0006_student_equipped_avatar_student_equipped_theme_and_more')]
    operations = [
        migrations.AddField(model_name='mission', name='coin_reward', field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name='mission', name='game_active', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='mission', name='map_layout', field=models.JSONField(blank=True, default=dict)),
        migrations.CreateModel(name='MazeObject', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('type', models.CharField(choices=[('question','Question'),('enemy','Enemy'),('clue','Clue'),('door','Door'),('key','Key'),('chest','Chest'),('weapon','Weapon'),('exit','Exit')], max_length=16)),
            ('position', models.JSONField(default=list)), ('label', models.CharField(blank=True, max_length=100)), ('reward_data', models.JSONField(blank=True, default=dict)), ('required_item', models.CharField(blank=True, max_length=100)), ('order', models.PositiveIntegerField(default=0)),
            ('mission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='maze_objects', to='camp.mission')),
            ('question', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='maze_objects', to='camp.challengequestion')),
        ], options={'ordering':['order','id']}),
        migrations.CreateModel(name='MissionGameProgress', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')), ('position', models.JSONField(default=list)), ('health', models.PositiveIntegerField(default=100)), ('inventory', models.JSONField(default=list)), ('completed_objects', models.JSONField(default=list)), ('completed_at', models.DateTimeField(blank=True, null=True)),
            ('mission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='game_progress', to='camp.mission')), ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='mission_game_progress', to='users.student')),
        ]),
        migrations.AddConstraint(model_name='missiongameprogress', constraint=models.UniqueConstraint(fields=('student','mission'), name='unique_student_mission_game')),
    ]
